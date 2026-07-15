<?php

declare(strict_types=1);

/**
 * AutoLinkEngine — core logic for automatic connection creation.
 *
 * Algorithm:
 *   1. Load all nodes from DB.
 *   2. For each endpoint (e.g. ПК/принтер): find switch/коммутатор with matching
 *      cabinet segment. If none found, create one. Connect.
 *   3. For each switch/коммутатор: find any router/маршрутизатор, create connection.
 *
 * Name parsing: split by configurable delimiter, use cabinet_index for segment.
 */
class AutoLinkEngine
{
    /** @var array<int, array<string, mixed>> */
    private array $nodes = [];
    private int $nodesCreated = 0;
    private int $connectionsCreated = 0;
    /** @var string[] */
    private array $errors = [];

    private array $schema;
    private string $delimiter;
    private int $cabinetIndex;

    /** @var string[] Types considered "endpoints" (ПК, принтер, etc.) */
    private array $endpointTypes;
    /** Type name for the access-layer switch (коммутатор) */
    private string $switchType;
    /** Type name for core router (маршрутизатор) */
    private string $routerType;

    private const DEFAULT_SCHEMA        = ['здание', 'этаж', 'кабинет', 'устройство'];
    private const DEFAULT_DELIMITER     = '-';
    private const DEFAULT_CABINET_INDEX = 2;
    private const DEFAULT_ENDPOINT_TYPES = ['ПК', 'принтер'];
    private const DEFAULT_SWITCH_TYPE   = 'коммутатор';
    private const DEFAULT_ROUTER_TYPE   = 'маршрутизатор';

    public function __construct(
        private readonly PDO $db,
        ?array  $schema        = null,
        ?string $delimiter     = null,
        ?int    $cabinetIndex  = null,
        ?array  $endpointTypes = null,
        ?string $switchType    = null,
        ?string $routerType    = null
    ) {
        $this->schema        = $schema        ?? self::DEFAULT_SCHEMA;
        $this->delimiter     = $delimiter     ?? self::DEFAULT_DELIMITER;
        $this->cabinetIndex  = $cabinetIndex  ?? self::DEFAULT_CABINET_INDEX;
        $this->endpointTypes = $endpointTypes ?? self::DEFAULT_ENDPOINT_TYPES;
        $this->switchType    = $switchType    ?? self::DEFAULT_SWITCH_TYPE;
        $this->routerType    = $routerType    ?? self::DEFAULT_ROUTER_TYPE;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public function run(): array
    {
        $this->nodesCreated       = 0;
        $this->connectionsCreated = 0;
        $this->errors             = [];

        $this->loadNodes();

        // Step 1: endpoints → switch (by cabinet)
        $this->linkEndpointsToSwitch();

        // Step 2: switch → router
        $this->linkSwitchToRouter();

        return [
            'nodes_created'       => $this->nodesCreated,
            'connections_created' => $this->connectionsCreated,
            'errors'              => $this->errors,
        ];
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    private function loadNodes(): void
    {
        $stmt = $this->db->query('SELECT * FROM node ORDER BY id');
        $rows = $stmt->fetchAll();
        $this->nodes = [];
        foreach ($rows as $row) {
            $this->nodes[(int) $row['id']] = $row;
        }
    }

    // -------------------------------------------------------------------------
    // Name parsing
    // -------------------------------------------------------------------------

    private function getCabinetSegment(string $name): ?string
    {
        $parts = explode($this->delimiter, $name);
        if ($this->cabinetIndex >= count($parts)) {
            return null;
        }
        return $parts[$this->cabinetIndex];
    }

    // -------------------------------------------------------------------------
    // Node lookup
    // -------------------------------------------------------------------------

    private function getNodesByType(string $type): array
    {
        $result = [];
        foreach ($this->nodes as $id => $node) {
            if ($node['type'] === $type) {
                $result[$id] = $node;
            }
        }
        return $result;
    }

    private function getNodesByTypes(array $types): array
    {
        $result = [];
        foreach ($this->nodes as $id => $node) {
            if (in_array($node['type'], $types, true)) {
                $result[$id] = $node;
            }
        }
        return $result;
    }

    private function getFirstNodeByType(string $type): ?array
    {
        foreach ($this->nodes as $node) {
            if ($node['type'] === $type) {
                return $node;
            }
        }
        return null;
    }

    private function findSwitchByCabinet(string $cabinet): ?array
    {
        foreach ($this->nodes as $node) {
            if ($node['type'] !== $this->switchType) {
                continue;
            }
            $nodeCabinet = $this->getCabinetSegment((string) $node['name']);
            if ($nodeCabinet === $cabinet) {
                return $node;
            }
            if ($node['name'] === 'SW' . $this->delimiter . $cabinet) {
                return $node;
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Node creation
    // -------------------------------------------------------------------------

    private function createSwitchNode(string $cabinet): array
    {
        $name = 'SW' . $this->delimiter . $cabinet;

        $stmt = $this->db->prepare('INSERT INTO node (name, type) VALUES (:name, :type)');
        $stmt->execute([':name' => $name, ':type' => $this->switchType]);

        $id = (int) $this->db->lastInsertId();

        $newNode = [
            'id'       => $id,
            'name'     => $name,
            'type'     => $this->switchType,
            'model_id' => null,
            'ip'       => null,
            'mac'      => null,
        ];

        $this->nodes[$id] = $newNode;
        $this->nodesCreated++;

        return $newNode;
    }

    // -------------------------------------------------------------------------
    // Connection management
    // -------------------------------------------------------------------------

    private function connectionExists(int $a, int $b): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM connection
             WHERE (src_node_id = :a AND dst_node_id = :b)
                OR (src_node_id = :b2 AND dst_node_id = :a2)
             LIMIT 1'
        );
        $stmt->execute([':a' => $a, ':b' => $b, ':b2' => $b, ':a2' => $a]);
        return $stmt->fetch() !== false;
    }

    private function ensureConnection(int $srcId, int $dstId): bool
    {
        if ($this->connectionExists($srcId, $dstId)) {
            return false;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO connection (src_node_id, dst_node_id) VALUES (:src, :dst)'
        );
        $stmt->execute([':src' => $srcId, ':dst' => $dstId]);
        $this->connectionsCreated++;
        return true;
    }

    // -------------------------------------------------------------------------
    // Algorithm steps
    // -------------------------------------------------------------------------

    private function linkEndpointsToSwitch(): void
    {
        $endpoints = $this->getNodesByTypes($this->endpointTypes);

        foreach ($endpoints as $node) {
            $nodeName = (string) $node['name'];
            $nodeId   = (int) $node['id'];

            try {
                $cabinet = $this->getCabinetSegment($nodeName);

                if ($cabinet === null) {
                    $this->errors[] = "Нода '{$nodeName}' (id={$nodeId}): не удалось извлечь сегмент кабинета из имени";
                    continue;
                }

                $sw = $this->findSwitchByCabinet($cabinet);
                if ($sw === null) {
                    $sw = $this->createSwitchNode($cabinet);
                }

                $this->ensureConnection($nodeId, (int) $sw['id']);
            } catch (\Throwable $e) {
                $this->errors[] = "Нода '{$nodeName}' (id={$nodeId}): " . $e->getMessage();
            }
        }
    }

    private function linkSwitchToRouter(): void
    {
        $router = $this->getFirstNodeByType($this->routerType);
        if ($router === null) {
            return;
        }

        $routerId = (int) $router['id'];

        foreach ($this->getNodesByType($this->switchType) as $sw) {
            $swId   = (int) $sw['id'];
            $swName = (string) $sw['name'];

            try {
                $this->ensureConnection($swId, $routerId);
            } catch (\Throwable $e) {
                $this->errors[] = "{$this->switchType} '{$swName}' (id={$swId}): " . $e->getMessage();
            }
        }
    }
}

// =============================================================================

/**
 * AutoLinkHandler — HTTP handler for POST /api/auto-link.
 *
 * Request body (JSON):
 *   - schema         string[]   Parse-schema labels
 *   - delimiter      string     Name delimiter (default "-")
 *   - cabinet_index  int        Index of the cabinet segment (default 2)
 *   - endpoint_types string[]   Types treated as endpoints (default ["ПК","принтер"])
 *   - switch_type    string     Access-layer switch type (default "коммутатор")
 *   - router_type    string     Core router type (default "маршрутизатор")
 */
class AutoLinkHandler
{
    public function __construct(private readonly PDO $db) {}

    public function run(): never
    {
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '', true);
        if (!is_array($data)) {
            $data = [];
        }

        $schema        = isset($data['schema']) && is_array($data['schema']) ? $data['schema'] : null;
        $delimiter     = isset($data['delimiter']) && is_string($data['delimiter']) ? $data['delimiter'] : null;
        $cabinetIndex  = isset($data['cabinet_index']) && is_numeric($data['cabinet_index']) ? (int) $data['cabinet_index'] : null;
        $endpointTypes = isset($data['endpoint_types']) && is_array($data['endpoint_types']) ? $data['endpoint_types'] : null;
        $switchType    = isset($data['switch_type']) && is_string($data['switch_type']) ? $data['switch_type'] : null;
        $routerType    = isset($data['router_type']) && is_string($data['router_type']) ? $data['router_type'] : null;

        $engine = new AutoLinkEngine(
            $this->db,
            $schema,
            $delimiter,
            $cabinetIndex,
            $endpointTypes,
            $switchType,
            $routerType
        );

        $result = $engine->run();

        $httpCode = ($result['connections_created'] === 0 && count($result['errors']) > 0) ? 207 : 200;

        jsonResponse($result, $httpCode);
    }
}
