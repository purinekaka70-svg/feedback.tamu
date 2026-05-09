<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['name']);
$name = safe_text($payload['name'], 100);
$nameKey = strtolower(trim((string) preg_replace('/\s+/', ' ', $name)));
$image = validate_base64_image($payload['image'] ?? '', 153600);
$businessId = trim_string($payload['businessId'] ?? '') !== '' ? int_value($payload['businessId']) : null;
$claims = current_auth_claims();
if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
    $sellerBusinessId = (int) ($claims['businessId'] ?? 0);
    if ($businessId === null) {
        $businessId = $sellerBusinessId;
    }
    if ($businessId !== $sellerBusinessId) {
        json_response(['ok' => false, 'message' => 'You can only manage categories for your approved business.'], 403);
    }
}

try {
    $pdo = tamu_pdo();
    if ($nameKey === '') {
        json_response(['ok' => false, 'message' => 'Category name is required.'], 422);
    }
    $hasImage = column_exists($pdo, 'categories', 'image');
    if ($hasImage) {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (business_id, name, image)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE image = VALUES(image)'
        );
        $stmt->execute([$businessId, $name, $image]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO categories (business_id, name)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $stmt->execute([$businessId, $name]);
    }

    json_response(['ok' => true, 'category' => ['id' => (int) $pdo->lastInsertId()]]);
} catch (PDOException $error) {
    safe_error('Failed to save category.');
}
