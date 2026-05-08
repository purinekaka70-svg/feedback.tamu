<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);

try {
    $pdo = tamu_pdo();
    $stmt = $pdo->prepare('DELETE FROM orders WHERE public_id = ?');
    $stmt->execute([trim_string($payload['id'])]);
    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete order.');
}
