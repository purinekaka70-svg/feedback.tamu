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
    $claims = current_auth_claims();
    if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
        if (!is_numeric($id)) {
            json_response(['ok' => false, 'message' => 'Seller category delete requires a category id.'], 422);
        }
        $check = $pdo->prepare('SELECT business_id FROM categories WHERE id = ? LIMIT 1');
        $check->execute([(int) $id]);
        $businessId = $check->fetchColumn();
        if ($businessId !== null && (int) $businessId !== (int) ($claims['businessId'] ?? 0)) {
            json_response(['ok' => false, 'message' => 'You can only delete categories from your business.'], 403);
        }
    }
    $stmt = $pdo->prepare('DELETE FROM categories WHERE id = ? OR name = ?');
    $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);

    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to delete category.');
}
