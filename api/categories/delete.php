<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'categories')) {
        json_response(['ok' => false, 'message' => 'Categories table is not installed.'], 500);
    }

    $id = trim_string($payload['id']);
    $stmt = $pdo->prepare('DELETE FROM categories WHERE id = ? OR name = ?');
    $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);

    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete category.');
}
