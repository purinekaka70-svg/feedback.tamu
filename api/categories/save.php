<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['name']);
$name = safe_text($payload['name'], 100);
$image = validate_base64_image($payload['image'] ?? '', 1048576);

try {
    $pdo = tamu_pdo();
    $hasImage = column_exists($pdo, 'categories', 'image');
    if ($hasImage) {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (name, image)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE image = VALUES(image)'
        );
        $stmt->execute([$name, $image]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (name)
             VALUES (?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $stmt->execute([$name]);
    }

    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to save category.');
}
