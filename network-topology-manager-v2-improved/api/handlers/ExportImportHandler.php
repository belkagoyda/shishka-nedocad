<?php

declare(strict_types=1);

require_once __DIR__ . '/BaseHandler.php';

class ExportImportHandler extends BaseHandler
{
    private const EXPORT_DIR = '/srv';

    // --------------------------------------------------------------
    // Экспорт
    // --------------------------------------------------------------
    public function export(): void
    {
        $models = $this->db->query('SELECT * FROM model ORDER BY id')->fetchAll();
        $nodes = $this->db->query('SELECT * FROM node ORDER BY id')->fetchAll();
        $connections = $this->db->query('SELECT * FROM connection ORDER BY id')->fetchAll();

        $data = [
            'exported_at' => date('Y-m-d H:i:s'),
            'models' => $models,
            'nodes' => $nodes,
            'connections' => $connections,
        ];

        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

        $dir = self::EXPORT_DIR;
        if (!is_dir($dir)) {
            if (!@mkdir($dir, 0777, true)) {
                jsonError("Cannot create export directory: {$dir}", 500);
            }
        }

        $filename = 'network-topology-export-' . date('Ymd-His') . '.json';
        $filepath = $dir . '/' . $filename;

        if (file_put_contents($filepath, $json) === false) {
            jsonError("Failed to write export file: {$filepath}", 500);
        }

        jsonResponse([
            'message' => 'Export successful',
            'filename' => $filename,
            'path' => $filepath,
            'models_count' => count($models),
            'nodes_count' => count($nodes),
            'connections_count' => count($connections),
        ]);
    }

    // --------------------------------------------------------------
    // Импорт из файла (старый метод)
    // --------------------------------------------------------------
    public function import(): void
    {
        $body = $this->parseBody();
        $filename = $body['filename'] ?? '';
        if ($filename === '') {
            jsonError("Field 'filename' is required", 400);
        }
        $basename = basename($filename);
        $filepath = self::EXPORT_DIR . '/' . $basename;
        if (!is_file($filepath)) {
            jsonError("File not found: {$basename}", 404);
        }
        $raw = file_get_contents($filepath);
        if ($raw === false) {
            jsonError("Failed to read file: {$basename}", 500);
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonError("Invalid JSON in file: {$basename}", 400);
        }

        try {
            $result = $this->performImport($data);
            jsonResponse($result);
        } catch (\Exception $e) {
            jsonError($e->getMessage(), 500);
        }
    }

    // --------------------------------------------------------------
    // Импорт из JSON-данных (для XLSX)
    // --------------------------------------------------------------
    public function importData(): void
    {
        $data = $this->parseBody();
        try {
            $result = $this->performImport($data);
            jsonResponse($result);
        } catch (\Exception $e) {
            jsonError($e->getMessage(), 500);
        }
    }

    // --------------------------------------------------------------
    // Общий движок импорта
    // --------------------------------------------------------------
    private function performImport(array $data): array
    {
        $models = $data['models'] ?? [];
        $nodes = $data['nodes'] ?? [];
        $connections = $data['connections'] ?? [];

        // Приведение типов для моделей
        foreach ($models as &$m) {
            $m['id'] = isset($m['id']) && $m['id'] !== '' ? (int) $m['id'] : null;
            $m['rank'] = isset($m['rank']) && $m['rank'] !== '' ? (int) $m['rank'] : 1;
            $m['width'] = isset($m['width']) && $m['width'] !== '' ? (int) $m['width'] : 40;
            $m['height'] = isset($m['height']) && $m['height'] !== '' ? (int) $m['height'] : 12;
            if (empty($m['name']) || empty($m['type'])) {
                throw new \Exception('Model name and type are required.');
            }
        }
        unset($m);

        // Приведение типов для нод
        foreach ($nodes as &$n) {
            $n['id'] = isset($n['id']) && $n['id'] !== '' ? (int) $n['id'] : null;
            $n['model_id'] = isset($n['model_id']) && $n['model_id'] !== '' ? (int) $n['model_id'] : null;
            if (empty($n['name']) || empty($n['type'])) {
                throw new \Exception('Node name and type are required.');
            }
            $n['ip'] = isset($n['ip']) ? (string) $n['ip'] : null;
            $n['mac'] = isset($n['mac']) ? (string) $n['mac'] : null;
        }
        unset($n);

        // Приведение типов для связей
        foreach ($connections as &$c) {
            $c['id'] = isset($c['id']) && $c['id'] !== '' ? (int) $c['id'] : null;
            $c['src_node_id'] = isset($c['src_node_id']) && $c['src_node_id'] !== '' ? (int) $c['src_node_id'] : null;
            $c['dst_node_id'] = isset($c['dst_node_id']) && $c['dst_node_id'] !== '' ? (int) $c['dst_node_id'] : null;
            if ($c['src_node_id'] === null || $c['dst_node_id'] === null) {
                throw new \Exception('Connection src_node_id and dst_node_id are required.');
            }
            $c['src_port_id'] = isset($c['src_port_id']) ? (string) $c['src_port_id'] : null;
            $c['dst_port_id'] = isset($c['dst_port_id']) ? (string) $c['dst_port_id'] : null;
            $c['type_line'] = isset($c['type_line']) ? (string) $c['type_line'] : 'normal';
            $c['colour_line'] = isset($c['colour_line']) ? (string) $c['colour_line'] : '#000000';
        }
        unset($c);

        $this->db->exec('PRAGMA foreign_keys = OFF;');
        $this->db->beginTransaction();

        try {
            $this->db->exec('DELETE FROM connection');
            $this->db->exec('DELETE FROM node');
            $this->db->exec('DELETE FROM model');
            $this->db->exec("DELETE FROM sqlite_sequence WHERE name IN ('model','node','connection')");

            // Импорт моделей
            $stmtModel = $this->db->prepare(
                'INSERT INTO model (id, name, type, rank, width, height) VALUES (:id, :name, :type, :rank, :width, :height)'
            );
            foreach ($models as $m) {
                $stmtModel->execute([
                    ':id'     => $m['id'],
                    ':name'   => $m['name'],
                    ':type'   => $m['type'],
                    ':rank'   => $m['rank'],
                    ':width'  => $m['width'],
                    ':height' => $m['height'],
                ]);
            }

            // Импорт нод
            $stmtNode = $this->db->prepare(
                'INSERT INTO node (id, name, type, model_id, ip, mac) VALUES (:id, :name, :type, :model_id, :ip, :mac)'
            );
            foreach ($nodes as $n) {
                $stmtNode->execute([
                    ':id'       => $n['id'],
                    ':name'     => $n['name'],
                    ':type'     => $n['type'],
                    ':model_id' => $n['model_id'],
                    ':ip'       => $n['ip'],
                    ':mac'      => $n['mac'],
                ]);
            }

            // Импорт связей
            $stmtConn = $this->db->prepare(
                'INSERT INTO connection (id, src_node_id, dst_node_id, src_port_id, dst_port_id, type_line, colour_line)
                 VALUES (:id, :src_node_id, :dst_node_id, :src_port_id, :dst_port_id, :type_line, :colour_line)'
            );
            foreach ($connections as $c) {
                $stmtConn->execute([
                    ':id'          => $c['id'],
                    ':src_node_id' => $c['src_node_id'],
                    ':dst_node_id' => $c['dst_node_id'],
                    ':src_port_id' => $c['src_port_id'],
                    ':dst_port_id' => $c['dst_port_id'],
                    ':type_line'   => $c['type_line'],
                    ':colour_line' => $c['colour_line'],
                ]);
            }

            $this->db->commit();
            $this->db->exec('PRAGMA foreign_keys = ON;');

            return [
                'models_count'      => count($models),
                'nodes_count'       => count($nodes),
                'connections_count' => count($connections),
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->db->exec('PRAGMA foreign_keys = ON;');
            throw new \Exception('Import failed: ' . $e->getMessage());
        }
    }

    // --------------------------------------------------------------
    // Список файлов экспорта
    // --------------------------------------------------------------
    public function listFiles(): void
    {
        $dir = self::EXPORT_DIR;
        $files = [];

        if (is_dir($dir)) {
            $entries = scandir($dir);
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                if (!str_starts_with($entry, 'network-topology-export')) continue;
                if (!str_ends_with($entry, '.json')) continue;
                $fullPath = $dir . '/' . $entry;
                $files[] = [
                    'filename' => $entry,
                    'size' => filesize($fullPath),
                    'modified' => date('Y-m-d H:i:s', filemtime($fullPath)),
                ];
            }
        }

        usort($files, fn($a, $b) => strcmp($b['filename'], $a['filename']));
        jsonResponse($files);
    }
}