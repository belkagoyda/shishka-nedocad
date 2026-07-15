<?php

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Router for PHP built-in development server
// ---------------------------------------------------------------------------

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$uriPath = parse_url($requestUri, PHP_URL_PATH) ?: '/';

if (PHP_SAPI === 'cli-server' && $uriPath !== '/api' && !str_starts_with($uriPath, '/api/')) {
    $docRoot = __DIR__ . '/..';

    if ($uriPath === '/' || $uriPath === '') {
        readfile($docRoot . '/models.html');
        exit;
    }

    $staticFile = $docRoot . $uriPath;
    if (is_file($staticFile)) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// API dispatcher
// ---------------------------------------------------------------------------

header('Content-Type: application/json');

function jsonResponse(mixed $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonError(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$db = require __DIR__ . '/../db/init.php';

$apiPath = $uriPath;
if (str_starts_with($apiPath, '/api')) {
    $apiPath = substr($apiPath, 4) ?: '/';
}
$apiPath = rtrim($apiPath, '/') ?: '/';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$segments = explode('/', ltrim($apiPath, '/'));
$resource = $segments[0] ?? '';
$id       = isset($segments[1]) && $segments[1] !== '' ? $segments[1] : null;

try {
    switch ($resource) {
        case 'models':
            require_once __DIR__ . '/handlers/ModelHandler.php';
            $handler = new ModelHandler($db);
            if ($id === null) {
                match ($method) {
                    'GET'  => $handler->index(),
                    'POST' => $handler->create(),
                    default => jsonError('Method Not Allowed', 405),
                };
            } else {
                match ($method) {
                    'GET'    => $handler->show((int) $id),
                    'PUT'    => $handler->update((int) $id),
                    'DELETE' => $handler->destroy((int) $id),
                    default  => jsonError('Method Not Allowed', 405),
                };
            }
            break;

        case 'nodes':
            require_once __DIR__ . '/handlers/NodeHandler.php';
            $handler = new NodeHandler($db);
            if ($id === null) {
                match ($method) {
                    'GET'  => $handler->index(),
                    'POST' => $handler->create(),
                    default => jsonError('Method Not Allowed', 405),
                };
            } else {
                match ($method) {
                    'GET'    => $handler->show((int) $id),
                    'PUT'    => $handler->update((int) $id),
                    'DELETE' => $handler->destroy((int) $id),
                    default  => jsonError('Method Not Allowed', 405),
                };
            }
            break;

        case 'connections':
            require_once __DIR__ . '/handlers/ConnectionHandler.php';
            $handler = new ConnectionHandler($db);
            if ($id === null) {
                match ($method) {
                    'GET'  => $handler->index(),
                    'POST' => $handler->create(),
                    default => jsonError('Method Not Allowed', 405),
                };
            } else {
                match ($method) {
                    'GET'    => $handler->show((int) $id),
                    'PUT'    => $handler->update((int) $id),
                    'DELETE' => $handler->destroy((int) $id),
                    default  => jsonError('Method Not Allowed', 405),
                };
            }
            break;

        case 'auto-link':
            require_once __DIR__ . '/handlers/AutoLinkHandler.php';
            $handler = new AutoLinkHandler($db);
            match ($method) {
                'POST'  => $handler->run(),
                default => jsonError('Method Not Allowed', 405),
            };
            break;

        case 'export':
            require_once __DIR__ . '/handlers/ExportImportHandler.php';
            $handler = new ExportImportHandler($db);
            if ($id === 'list') {
                match ($method) {
                    'GET'   => $handler->listFiles(),
                    default => jsonError('Method Not Allowed', 405),
                };
            } else {
                match ($method) {
                    'GET'   => $handler->export(),
                    default => jsonError('Method Not Allowed', 405),
                };
            }
            break;

        case 'import':
            require_once __DIR__ . '/handlers/ExportImportHandler.php';
            $handler = new ExportImportHandler($db);
            match ($method) {
                'POST'  => $handler->import(),
                default => jsonError('Method Not Allowed', 405),
            };
            break;

        // НОВЫЙ МАРШРУТ ДЛЯ ИМПОРТА ДАННЫХ ИЗ JSON (XLSX)
        case 'import-data':
            require_once __DIR__ . '/handlers/ExportImportHandler.php';
            $handler = new ExportImportHandler($db);
            match ($method) {
                'POST'  => $handler->importData(),
                default => jsonError('Method Not Allowed', 405),
            };
            break;

        default:
            jsonError('Not Found', 404);
    }
} catch (Throwable $e) {
    error_log((string) $e);
    jsonError('Internal server error', 500);
}