<?php

declare(strict_types=1);

require_once __DIR__ . '/BaseHandler.php';

/**
 * ModelHandler — CRUD handler for the `model` table.
 *
 * Handles:
 *   GET    /api/models        → index()
 *   GET    /api/models/:id    → show($id)
 *   POST   /api/models        → create()
 *   PUT    /api/models/:id    → update($id)
 *   DELETE /api/models/:id    → destroy($id)
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
class ModelHandler extends BaseHandler
{
    // -------------------------------------------------------------------------
    // GET /api/models
    // -------------------------------------------------------------------------

    /**
     * Return all model records as a JSON array.
     * HTTP 200 on success.
     */
    public function index(): never
    {
        $stmt = $this->db->query('SELECT * FROM model ORDER BY id');
        $rows = $stmt->fetchAll();
        jsonResponse($rows);
    }

    // -------------------------------------------------------------------------
    // GET /api/models/:id
    // -------------------------------------------------------------------------

    /**
     * Return a single model record or HTTP 404 if not found.
     */
    public function show(int $id): never
    {
        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // POST /api/models
    // -------------------------------------------------------------------------

    /**
     * Create a new model record.
     * HTTP 201 on success, 400 on validation error, 409 on duplicate name.
     */
    public function create(): never
    {
        $data = $this->parseBody();

        // Validate required fields and business rules
        $this->validateName($data);
        $this->validateType($data);
        $this->validateRank($data);

        $name   = trim((string) $data['name']);
        $type   = (string) $data['type'];
        $rank   = (int) $data['rank'];
        $width  = isset($data['width'])  ? (int) $data['width']  : 40;
        $height = isset($data['height']) ? (int) $data['height'] : 12;

        try {
            $stmt = $this->db->prepare(
                'INSERT INTO model (name, type, rank, width, height) VALUES (:name, :type, :rank, :width, :height)'
            );
            $stmt->execute([
                ':name'   => $name,
                ':type'   => $type,
                ':rank'   => $rank,
                ':width'  => $width,
                ':height' => $height,
            ]);
        } catch (PDOException $e) {
            $this->handlePdoException($e, $name);
        }

        $id  = (int) $this->db->lastInsertId();
        $row = $this->findOrFail($id);
        jsonResponse($row, 201);
    }

    // -------------------------------------------------------------------------
    // PUT /api/models/:id
    // -------------------------------------------------------------------------

    /**
     * Update an existing model record.
     * HTTP 200 on success, 400 on validation error, 404 if not found, 409 on duplicate name.
     */
    public function update(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $data = $this->parseBody();

        // Validate required fields and business rules
        $this->validateName($data);
        $this->validateType($data);
        $this->validateRank($data);

        $name   = trim((string) $data['name']);
        $type   = (string) $data['type'];
        $rank   = (int) $data['rank'];
        $width  = isset($data['width'])  ? (int) $data['width']  : 40;
        $height = isset($data['height']) ? (int) $data['height'] : 12;

        try {
            $stmt = $this->db->prepare(
                'UPDATE model SET name = :name, type = :type, rank = :rank, width = :width, height = :height WHERE id = :id'
            );
            $stmt->execute([
                ':name'   => $name,
                ':type'   => $type,
                ':rank'   => $rank,
                ':width'  => $width,
                ':height' => $height,
                ':id'     => $id,
            ]);
        } catch (PDOException $e) {
            $this->handlePdoException($e, $name);
        }

        $row = $this->findOrFail($id);
        jsonResponse($row);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/models/:id
    // -------------------------------------------------------------------------

    /**
     * Delete a model record.
     * FK ON DELETE SET NULL handles nullifying node.model_id (Requirement 1.6).
     * HTTP 200 on success, 404 if not found.
     */
    public function destroy(int $id): never
    {
        // Ensure the record exists first
        $this->findOrFail($id);

        $stmt = $this->db->prepare('DELETE FROM model WHERE id = :id');
        $stmt->execute([':id' => $id]);

        jsonResponse(['message' => 'Deleted']);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Fetch a model by ID or send HTTP 404 and exit.
     *
     * @return array<string, mixed>
     */
    private function findOrFail(int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM model WHERE id = :id');
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
     * Validate the `type` field: required and non-empty string.
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
     * Validate the `rank` field: required and must be an integer in [0, 10].
     *
     * @param array<string, mixed> $data
     */
    private function validateRank(array $data): void
    {
        if (!isset($data['rank'])) {
            jsonError("Field 'rank' is required", 400);
        }

        $rank = $data['rank'];

        if (!is_numeric($rank) || (int) $rank != $rank) {
            jsonError('rank must be between 0 and 10', 400);
        }

        $rankInt = (int) $rank;

        if ($rankInt < 0 || $rankInt > 10) {
            jsonError('rank must be between 0 and 10', 400);
        }
    }

}
