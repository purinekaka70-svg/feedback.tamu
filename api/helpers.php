<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_method(string $method): void
{
    $requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (strtoupper($requestMethod) !== strtoupper($method)) {
        json_response([
            'ok' => false,
            'message' => 'Method not allowed.',
        ], 405);
    }
}

function read_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response([
            'ok' => false,
            'message' => 'Invalid JSON payload.',
        ], 400);
    }

    return $decoded;
}

function trim_string($value): string
{
    return trim((string) ($value ?? ''));
}

function float_value($value): float
{
    return is_numeric($value) ? (float) $value : 0.0;
}

function int_value($value): int
{
    return is_numeric($value) ? (int) $value : 0;
}

function string_array($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $cleaned = [];
    foreach ($value as $entry) {
        $text = trim_string($entry);
        if ($text !== '') {
            $cleaned[] = $text;
        }
    }

    return array_values(array_unique($cleaned));
}

function require_fields(array $payload, array $fields): void
{
    $missing = [];

    foreach ($fields as $field) {
        if (trim_string($payload[$field] ?? '') === '') {
            $missing[] = $field;
        }
    }

    if ($missing) {
        json_response([
            'ok' => false,
            'message' => 'Missing required fields.',
            'missing' => $missing,
        ], 422);
    }
}

function generate_public_id(string $prefix): string
{
    try {
        return $prefix . '-' . bin2hex(random_bytes(6));
    } catch (Exception $error) {
        return $prefix . '-' . uniqid();
    }
}
