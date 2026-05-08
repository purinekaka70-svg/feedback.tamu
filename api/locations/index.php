<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'locations')) {
        json_response(['ok' => false, 'message' => 'Locations table is not installed.'], 500);
    }

    if ($method === 'GET') {
        $createdAtColumn = column_exists($pdo, 'locations', 'created_at') ? ', created_at' : '';
        $rows = $pdo->query("SELECT id, name, image, description{$createdAtColumn} FROM locations ORDER BY name ASC")->fetchAll();
        json_response(['ok' => true, 'locations' => $rows]);
    }

    if ($method === 'POST') {
        $payload = read_json_input();
        require_fields($payload, ['name']);
        $id = trim_string($payload['id'] ?? '');
        if ($id !== '' && is_numeric($id)) {
            $stmt = $pdo->prepare(
                'INSERT INTO locations (id, name, image, description)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    image = VALUES(image),
                    description = VALUES(description)'
            );
            $stmt->execute([
                (int) $id,
                trim_string($payload['name']),
                trim_string($payload['image'] ?? ''),
                trim_string($payload['description'] ?? ''),
            ]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO locations (name, image, description)
                 VALUES (?, ?, ?)'
            );
            $stmt->execute([
                trim_string($payload['name']),
                trim_string($payload['image'] ?? ''),
                trim_string($payload['description'] ?? ''),
            ]);
            $id = (string) $pdo->lastInsertId();
        }
        json_response(['ok' => true, 'location' => ['id' => $id]], 201);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Locations request failed.', 'error' => $error->getMessage()], 500);
}
