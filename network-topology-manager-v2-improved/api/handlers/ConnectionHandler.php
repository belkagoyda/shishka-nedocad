<?php

declare(strict_types=1);

require_once __DIR__ . '/BaseHandler.php';

/**
 * ConnectionHandler — CRUD handler for the `connection` table.
 *
 * Handles:
 *   GET    /api/connections        → index()
 *   GET    /api/connections/:id    → show($id)
 *   POST   /api/connections        → create()
 *   PUT    /api/connections/:id    → update($id)
 *   DELETE /api/connections/:id    → destroy($id)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
class ConnectionHandler extends BaseHandler
{
    /** Allowed values for the `type_line` field (Requirement 4.3). */
    private const VALID_TYPE_LINES = ['normal', 'thin', 'thick', 'dashed'];

    /** Default value for `type_line` (Requirement 4.3). */
    private const DEFAULT_TYPE_LINE = 'normal';

    /** Default value for `colour_line` (Requirement 4.4). */
    private const DEFAULT_COLOUR_LINE = '#000000';

    /** Regex pattern for `colour_line` validation (Requirement 4.4). */
    private const COLOUR_LINE_PATTERN = '/^#[0-9A-Fa-f]{6}$/';

    // -------------------------------------------------------------------------
    // GET /api/connections
    // -------------------------------------------------------------------------

    /**
     * Return all connection records as a JSON array, with source and destination
     * node names resolved via JOIN (Requirement 4.6).
     * HTTP 200 on success.
     */
    public function index(): never
    {
        $stmt = $this->db->query(
            'SELECT c.*,
                    src.name AS src_node_name,
                    dst.name AS dst_node_name
             FROM connection c
             JOIN node src ON src.id = c.src_node_id
             JOIN node dst ON dst.id = c.dst_node_id
             ORDER BY c.id'
        );
        $rows = $stmt->fetchAll();
        jsonResponse($rows);
    }

    // -------------------------------------------------------------------------
    // GET /api/connections/:id
    // -------------------------------------------------------------------------

    /**
     * Return a single connection record (with node names via JOIN) or HTTP 404.
     */
    public function show(int $id): never
    {
        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // POST /api/connections
    // -------------------------------------------------------------------------

    /**
     * Create a new connection record.
     * HTTP 201 on success, 400 on validation error.
     */
    public function create(): never
    {
        $data = $this->parseBody();

        $this->validateNodeIds($data);
        $this->validateTypeLine($data);
        $this->validateColourLine($data);

        $srcNodeId  = (int) $data['src_node_id'];
        $dstNodeId  = (int) $data['dst_node_id'];
        $typeLine   = isset($data['type_line'])   && $data['type_line']   !== '' ? (string) $data['type_line']   : self::DEFAULT_TYPE_LINE;
        $colourLine = isset($data['colour_line']) && $data['colour_line'] !== '' ? (string) $data['colour_line'] : self::DEFAULT_COLOUR_LINE;
        $srcPortId  = isset($data['src_port_id']) ? (string) $data['src_port_id'] : null;
        $dstPortId  = isset($data['dst_port_id']) ? (string) $data['dst_port_id'] : null;

        $stmt = $this->db->prepare(
            'INSERT INTO connection (src_node_id, dst_node_id, src_port_id, dst_port_id, type_line, colour_line)
             VALUES (:src_node_id, :dst_node_id, :src_port_id, :dst_port_id, :type_line, :colour_line)'
        );
        $stmt->execute([
            ':src_node_id'  => $srcNodeId,
            ':dst_node_id'  => $dstNodeId,
            ':src_port_id'  => $srcPortId,
            ':dst_port_id'  => $dstPortId,
            ':type_line'    => $typeLine,
            ':colour_line'  => $colourLine,
        ]);

        $id  = (int) $this->db->lastInsertId();
        $row = $this->findOrFail($id);
        jsonResponse($row, 201);
    }

    // -------------------------------------------------------------------------
    // PUT /api/connections/:id
    // -------------------------------------------------------------------------

    /**
     * Update an existing connection record.
     * HTTP 200 on success, 400 on validation error, 404 if not found.
     */
    public function update(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $data = $this->parseBody();

        $this->validateNodeIds($data);
        $this->validateTypeLine($data);
        $this->validateColourLine($data);

        $srcNodeId  = (int) $data['src_node_id'];
        $dstNodeId  = (int) $data['dst_node_id'];
        $typeLine   = isset($data['type_line'])   && $data['type_line']   !== '' ? (string) $data['type_line']   : self::DEFAULT_TYPE_LINE;
        $colourLine = isset($data['colour_line']) && $data['colour_line'] !== '' ? (string) $data['colour_line'] : self::DEFAULT_COLOUR_LINE;
        $srcPortId  = isset($data['src_port_id']) ? (string) $data['src_port_id'] : null;
        $dstPortId  = isset($data['dst_port_id']) ? (string) $data['dst_port_id'] : null;

        $stmt = $this->db->prepare(
            'UPDATE connection
             SET src_node_id = :src_node_id,
                 dst_node_id = :dst_node_id,
                 src_port_id = :src_port_id,
                 dst_port_id = :dst_port_id,
                 type_line   = :type_line,
                 colour_line = :colour_line
             WHERE id = :id'
        );
        $stmt->execute([
            ':src_node_id'  => $srcNodeId,
            ':dst_node_id'  => $dstNodeId,
            ':src_port_id'  => $srcPortId,
            ':dst_port_id'  => $dstPortId,
            ':type_line'    => $typeLine,
            ':colour_line'  => $colourLine,
            ':id'           => $id,
        ]);

        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/connections/:id
    // -------------------------------------------------------------------------

    /**
     * Delete a connection record.
     * HTTP 200 on success, 404 if not found.
     */
    public function destroy(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $stmt = $this->db->prepare('DELETE FROM connection WHERE id = :id');
        $stmt->execute([':id' => $id]);

        jsonResponse(['message' => 'Deleted']);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Fetch a connection by ID (with JOIN for node names) or send HTTP 404 and exit.
     *
     * @return array<string, mixed>
     */
    private function findOrFail(int $id): array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*,
                    src.name AS src_node_name,
                    dst.name AS dst_node_name
             FROM connection c
             JOIN node src ON src.id = c.src_node_id
             JOIN node dst ON dst.id = c.dst_node_id
             WHERE c.id = :id'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if ($row === false) {
            jsonError('Record not found', 404);
        }

        return $row;
    }

    /**
     * Validate `src_node_id` and `dst_node_id`: both required and must reference
     * existing node records (Requirement 4.2).
     *
     * @param array<string, mixed> $data
     */
    private function validateNodeIds(array $data): void
    {
        foreach (['src_node_id', 'dst_node_id'] as $field) {
            if (!isset($data[$field]) || $data[$field] === '' || $data[$field] === null) {
                jsonError("Field '{$field}' is required", 400);
            }

            $nodeId = (int) $data[$field];

            $stmt = $this->db->prepare('SELECT id FROM node WHERE id = :id');
            $stmt->execute([':id' => $nodeId]);

            if ($stmt->fetch() === false) {
                jsonError("Referenced record with id {$nodeId} does not exist", 400);
            }
        }

        if ((int) $data['src_node_id'] === (int) $data['dst_node_id']) {
            jsonError("Source and destination nodes must be different", 400);
        }
    }

    /**
     * Validate the `type_line` field: if provided, must be one of the allowed
     * enum values (Requirement 4.3).
     *
     * @param array<string, mixed> $data
     */
    private function validateTypeLine(array $data): void
    {
        if (!isset($data['type_line']) || $data['type_line'] === '') {
            // Optional; default will be applied in create/update
            return;
        }

        if (!in_array($data['type_line'], self::VALID_TYPE_LINES, true)) {
            jsonError("Invalid value '{$data['type_line']}' for field 'type_line'", 400);
        }
    }

    /**
     * Validate the `colour_line` field: if provided, must match `#RRGGBB`
     * (Requirement 4.4).
     *
     * @param array<string, mixed> $data
     */
    private function validateColourLine(array $data): void
    {
        if (!isset($data['colour_line']) || $data['colour_line'] === '') {
            // Optional; default will be applied in create/update
            return;
        }

        if (!preg_match(self::COLOUR_LINE_PATTERN, (string) $data['colour_line'])) {
            jsonError("Invalid value '{$data['colour_line']}' for field 'colour_line'", 400);
        }
    }
}
