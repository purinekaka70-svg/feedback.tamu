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
    $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');
    $stmt->execute([trim_string($payload['id'])]);
    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete product.');
}
