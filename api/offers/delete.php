<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'seller_offers')) {
        json_response(['ok' => false, 'message' => 'Seller offers table is not installed.'], 500);
    }

    $id = trim_string($payload['id']);
    $claims = current_auth_claims();
    if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
        $check = $pdo->prepare('SELECT seller_public_id FROM seller_offers WHERE public_id = ? OR id = ? LIMIT 1');
        $check->execute([$id, is_numeric($id) ? (int) $id : 0]);
        if ((string) $check->fetchColumn() !== (string) ($claims['businessId'] ?? '')) {
            json_response(['ok' => false, 'message' => 'You can only delete offers from your business.'], 403);
        }
    }
    $stmt = $pdo->prepare('DELETE FROM seller_offers WHERE public_id = ? OR id = ?');
    $stmt->execute([$id, is_numeric($id) ? (int) $id : 0]);

    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete offer.');
}
