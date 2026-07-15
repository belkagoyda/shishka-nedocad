<?php
/**
 * Database initialization script.
 *
 * Defines initDb() which opens (or creates) the SQLite database,
 * enables WAL mode and foreign keys, and creates all required tables.
 *
 * Can be used as an include from API handlers:
 *   $db = require __DIR__ . '/../db/init.php';
 *
 * Or run directly from the CLI:
 *   php db/init.php
 */

declare(strict_types=1);

function initDb(): PDO
{
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        http_response_code(500);
        echo json_encode([
            'error' => 'PDO SQLite driver is not installed. Install php-pdo-sqlite (e.g. sudo apt install php-pdo-sqlite or enable extension=pdo_sqlite in php.ini)',
        ]);
        exit;
    }

    $dbPath = __DIR__ . '/db.sqlite';

    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Enable WAL journal mode for concurrent reads (Requirement 8.4)
    $db->exec('PRAGMA journal_mode=WAL;');

    // Enforce foreign key constraints on every connection (Requirement 8.2)
    $db->exec('PRAGMA foreign_keys = ON;');

    // Create tables if they do not already exist (Requirement 8.2, 8.3)
    $db->exec("
        CREATE TABLE IF NOT EXISTS model (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT    NOT NULL UNIQUE,
            type    TEXT    NOT NULL,
            rank    INTEGER NOT NULL DEFAULT 2 CHECK(rank BETWEEN 0 AND 10),
            width   INTEGER NOT NULL DEFAULT 40,
            height  INTEGER NOT NULL DEFAULT 12
        );

        CREATE TABLE IF NOT EXISTS node (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT    NOT NULL UNIQUE,
            type     TEXT    NOT NULL,
            model_id INTEGER REFERENCES model(id) ON DELETE SET NULL,
            ip       TEXT,
            mac      TEXT
        );

        CREATE TABLE IF NOT EXISTS connection (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            src_node_id  INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            dst_node_id  INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            src_port_id  TEXT,
            dst_port_id  TEXT,
            type_line    TEXT NOT NULL DEFAULT 'normal' CHECK(type_line IN ('normal','thin','thick','dashed')),
            colour_line  TEXT NOT NULL DEFAULT '#000000'
        );
    ");

    return $db;
}

// When included by another script, return the PDO instance.
// When run directly from the CLI, also print a confirmation message.
$db = initDb();

if (PHP_SAPI === 'cli') {
    echo "Database initialized successfully.\n";
}

return $db;
