<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin']);

$payload = read_json_input();
require_fields($payload, ['entity', 'id']);

$entity = safe_text($payload['entity'], 40);
$id = trim_string($payload['id']);
if ($id === '') {
    json_response(['ok' => false, 'message' => 'Record id is required.'], 422);
}

function delete_order(PDO $pdo, string $id): void
{
    if (table_exists($pdo, 'payments')) {
        $stmt = $pdo->prepare('DELETE FROM payments WHERE order_public_id = ?');
        $stmt->execute([$id]);
    }
    if (table_exists($pdo, 'deliveries')) {
        $stmt = $pdo->prepare('DELETE FROM deliveries WHERE order_public_id = ?');
        $stmt->execute([$id]);
    }
    $stmt = $pdo->prepare('DELETE FROM orders WHERE public_id = ? OR id = ?');
    $stmt->execute([$id, is_numeric($id) ? (int) $id : 0]);
}

try {
    $pdo = tamu_pdo();
    $pdo->beginTransaction();

    switch ($entity) {
        case 'order':
            delete_order($pdo, $id);
            break;

        case 'payment':
            $stmt = $pdo->prepare('DELETE FROM payments WHERE id = ? OR order_public_id = ? OR reference = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id, $id]);
            break;

        case 'business':
        case 'seller':
            $userId = null;
            if (table_exists($pdo, 'businesses')) {
                $find = $pdo->prepare('SELECT user_id FROM businesses WHERE id = ? LIMIT 1');
                $find->execute([is_numeric($id) ? (int) $id : 0]);
                $userId = $find->fetchColumn() ?: null;
                $delete = $pdo->prepare('DELETE FROM businesses WHERE id = ?');
                $delete->execute([is_numeric($id) ? (int) $id : 0]);
            }
            if ($entity === 'seller' && $userId && table_exists($pdo, 'users')) {
                $deleteUser = $pdo->prepare("DELETE FROM users WHERE id = ? AND role = 'seller'");
                $deleteUser->execute([(int) $userId]);
            }
            break;

        case 'category':
            $stmt = $pdo->prepare('DELETE FROM categories WHERE id = ? OR name = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);
            break;

        case 'product':
            $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0]);
            break;

        case 'offer':
            $stmt = $pdo->prepare('DELETE FROM seller_offers WHERE id = ? OR public_id = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);
            break;

        case 'location':
            $stmt = $pdo->prepare('DELETE FROM locations WHERE id = ? OR name = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);
            break;

        case 'user':
        case 'employee':
            $roleClause = $entity === 'employee' ? " AND role = 'employee'" : '';
            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?{$roleClause}");
            $stmt->execute([is_numeric($id) ? (int) $id : 0]);
            break;

        case 'cart':
            $stmt = $pdo->prepare('DELETE FROM cart WHERE id = ? OR session_id = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);
            break;

        case 'delivery':
            $stmt = $pdo->prepare('DELETE FROM deliveries WHERE id = ? OR order_public_id = ?');
            $stmt->execute([is_numeric($id) ? (int) $id : 0, $id]);
            break;

        case 'notification':
            break;

        default:
            json_response(['ok' => false, 'message' => 'Unsupported admin entity.'], 422);
    }

    $pdo->commit();
    json_response(['ok' => true, 'message' => 'Record deleted.']);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    safe_error('Admin delete failed.');
}
