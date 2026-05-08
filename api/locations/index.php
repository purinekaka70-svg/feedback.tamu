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
        $rows = $pdo->query('SELECT id, name, image, description, created_at FROM locations ORDER BY name ASC')->fetchAll();
        json_response(['ok' => true, 'locations' => $rows]);
    }

    if ($method === 'POST') {
        $payload = read_json_input();
        require_fields($payload, ['name']);
        $id = trim_string($payload['id'] ?? '') ?: strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', trim_string($payload['name'])), '-'));
        $stmt = $pdo->prepare(
            'INSERT INTO locations (id, name, image, description)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                image = VALUES(image),
                description = VALUES(description)'
        );
        $stmt->execute([
            $id,
            trim_string($payload['name']),
            trim_string($payload['image'] ?? ''),
            trim_string($payload['description'] ?? ''),
        ]);
        json_response(['ok' => true, 'location' => ['id' => $id]], 201);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Locations request failed.', 'error' => $error->getMessage()], 500);
}
