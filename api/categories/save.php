<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['name']);

try {
    $pdo = tamu_pdo();
    $hasImage = column_exists($pdo, 'categories', 'image');
    if ($hasImage) {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (name, image)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE image = VALUES(image)'
        );
        $stmt->execute([trim_string($payload['name']), trim_string($payload['image'] ?? '')]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (name)
             VALUES (?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $stmt->execute([trim_string($payload['name'])]);
    }

    json_response(['ok' => true]);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Failed to save category.', 'error' => $error->getMessage()], 500);
}
