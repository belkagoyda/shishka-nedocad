<?php

declare(strict_types=1);

/**
 * BaseHandler — общий базовый класс для API-обработчиков.
 *
 * Содержит разделяемые методы: parseBody(), handlePdoException().
 */
abstract class BaseHandler
{
    public function __construct(protected readonly PDO $db) {}

    /**
     * Read and decode the JSON request body.
     *
     * @return array<string, mixed>
     */
    protected function parseBody(): array
    {
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '', true);

        if (!is_array($data)) {
            jsonError('Invalid or missing JSON body', 400);
        }

        return $data;
    }

    /**
     * Handle a PDOException, converting SQLSTATE 23000 (unique constraint) to HTTP 409.
     */
    protected function handlePdoException(PDOException $e, string $name): never
    {
        if (str_starts_with($e->getCode(), '23')) {
            jsonError("A record with name '{$name}' already exists", 409);
        }

        throw $e;
    }
}
