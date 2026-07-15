<?php

declare(strict_types=1);

require_once __DIR__ . '/BaseHandler.php';

/**
 * NodeHandler — CRUD handler for the `node` table.
 *
 * Handles:
 *   GET    /api/nodes        → index()
 *   GET    /api/nodes/:id    → show($id)
 *   POST   /api/nodes        → create()
 *   PUT    /api/nodes/:id    → update($id)
 *   DELETE /api/nodes/:id    → destroy($id)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9
 */
class NodeHandler extends BaseHandler
{
    // -------------------------------------------------------------------------
    // GET /api/nodes
    // -------------------------------------------------------------------------

    /**
     * Return all node records as a JSON array.
     * HTTP 200 on success.
     */
    public function index(): never
    {
        $stmt = $this->db->query('SELECT * FROM node ORDER BY id');
        $rows = $stmt->fetchAll();
        jsonResponse($rows);
    }

    // -------------------------------------------------------------------------
    // GET /api/nodes/:id
    // -------------------------------------------------------------------------

    /**
     * Return a single node record or HTTP 404 if not found.
     */
    public function show(int $id): never
    {
        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // POST /api/nodes
    // -------------------------------------------------------------------------

    /**
     * Create a new node record.
     * HTTP 201 on success, 400 on validation error, 409 on duplicate name.
     */
    public function create(): never
    {
        $data = $this->parseBody();

        $this->validateName($data);
        $this->validateType($data);
        $this->validateModelId($data);

        $name    = trim((string) $data['name']);
        $type    = (string) $data['type'];
        $modelId = isset($data['model_id']) && $data['model_id'] !== null && $data['model_id'] !== ''
            ? (int) $data['model_id']
            : null;
        $ip  = isset($data['ip'])  ? (string) $data['ip']  : null;
        $mac = isset($data['mac']) ? (string) $data['mac'] : null;

        try {
            $stmt = $this->db->prepare(
                'INSERT INTO node (name, type, model_id, ip, mac) VALUES (:name, :type, :model_id, :ip, :mac)'
            );
            $stmt->execute([
                ':name'     => $name,
                ':type'     => $type,
                ':model_id' => $modelId,
                ':ip'       => $ip,
                ':mac'      => $mac,
            ]);
        } catch (PDOException $e) {
            $this->handlePdoException($e, $name);
        }

        $id  = (int) $this->db->lastInsertId();
        $row = $this->findOrFail($id);
        jsonResponse($row, 201);
    }

    // -------------------------------------------------------------------------
    // PUT /api/nodes/:id
    // -------------------------------------------------------------------------

    /**
     * Update an existing node record.
     * HTTP 200 on success, 400 on validation error, 404 if not found, 409 on duplicate name.
     */
    public function update(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $data = $this->parseBody();

        $this->validateName($data);
        $this->validateType($data);
        $this->validateModelId($data);

        $name    = trim((string) $data['name']);
        $type    = (string) $data['type'];
        $modelId = isset($data['model_id']) && $data['model_id'] !== null && $data['model_id'] !== ''
            ? (int) $data['model_id']
            : null;
        $ip  = isset($data['ip'])  ? (string) $data['ip']  : null;
        $mac = isset($data['mac']) ? (string) $data['mac'] : null;

        try {
            $stmt = $this->db->prepare(
                'UPDATE node SET name = :name, type = :type, model_id = :model_id, ip = :ip, mac = :mac WHERE id = :id'
            );
            $stmt->execute([
                ':name'     => $name,
                ':type'     => $type,
                ':model_id' => $modelId,
                ':ip'       => $ip,
                ':mac'      => $mac,
                ':id'       => $id,
            ]);
        } catch (PDOException $e) {
            $this->handlePdoException($e, $name);
        }

        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/nodes/:id
    // -------------------------------------------------------------------------

    /**
     * Delete a node record.
     * FK ON DELETE CASCADE handles removing all related Connection records (Requirement 2.9).
     * HTTP 200 on success, 404 if not found.
     */
    public function destroy(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $stmt = $this->db->prepare('DELETE FROM node WHERE id = :id');
        $stmt->execute([':id' => $id]);

        jsonResponse(['message' => 'Deleted']);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Fetch a node by ID or send HTTP 404 and exit.
     *
     * @return array<string, mixed>
     */
    private function findOrFail(int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM node WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if ($row === false) {
            jsonError('Record not found', 404);
        }

        return $row;
    }

    /**
     * Validate the `name` field: required and non-empty.
     *
     * @param array<string, mixed> $data
     */
    private function validateName(array $data): void
    {
        if (!isset($data['name']) || trim((string) $data['name']) === '') {
            jsonError("Field 'name' is required", 400);
        }
    }

    /**
     * Validate the `type` field: required and must be one of the allowed enum values.
     *
     * @param array<string, mixed> $data
     */
    private function validateType(array $data): void
    {
        if (!isset($data['type']) || trim((string) $data['type']) === '') {
            jsonError("Field 'type' is required", 400);
        }
    }

    /**
     * Validate the `model_id` field: if provided, the referenced model must exist (Requirement 2.4).
     *
     * @param array<string, mixed> $data
     */
    private function validateModelId(array $data): void
    {
        if (!isset($data['model_id']) || $data['model_id'] === null || $data['model_id'] === '') {
            // model_id is optional; absence is valid
            return;
        }

        $modelId = (int) $data['model_id'];

        $stmt = $this->db->prepare('SELECT id FROM model WHERE id = :id');
        $stmt->execute([':id' => $modelId]);

        if ($stmt->fetch() === false) {
            jsonError("Referenced record with id {$modelId} does not exist", 400);
        }
    }

}
