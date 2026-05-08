<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'products')) {
        json_response(['ok' => false, 'message' => 'Products table is not installed.'], 500);
    }
    $claims = current_auth_claims();
    if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
        $check = $pdo->prepare('SELECT business_id FROM products WHERE id = ? LIMIT 1');
        $check->execute([int_value($payload['id'])]);
        if ((int) $check->fetchColumn() !== (int) ($claims['businessId'] ?? 0)) {
            json_response(['ok' => false, 'message' => 'You can only delete products from your business.'], 403);
        }
    }
    $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');
    $stmt->execute([trim_string($payload['id'])]);
    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete product.');
}
