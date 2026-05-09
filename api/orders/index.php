<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    require __DIR__ . '/list.php';
}

if ($method === 'POST') {
    require __DIR__ . '/create.php';
}

try {
    $pdo = tamu_pdo();

    if ($method === 'PATCH' || $method === 'PUT') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['id']);
        $claims = current_auth_claims();
        if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
            $orderCheck = $pdo->prepare(
                'SELECT COUNT(*)
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.public_id = ? AND oi.store_public_id = ?'
            );
            $orderCheck->execute([trim_string($payload['id']), (string) ($claims['businessId'] ?? '')]);
            if ((int) $orderCheck->fetchColumn() < 1) {
                json_response(['ok' => false, 'message' => 'You can only update orders for your approved business.'], 403);
            }
        }
        $allowedStatuses = ['pending', 'pending_payment', 'paid', 'processing', 'delivered', 'cancelled'];
        $sets = [];
        $params = [];

        $status = trim_string($payload['status'] ?? '');
        if ($status !== '') {
            if (!in_array($status, $allowedStatuses, true)) {
                json_response(['ok' => false, 'message' => 'Invalid order status.'], 422);
            }
            $sets[] = 'status = ?';
            $params[] = $status;
        }

        $paymentStatus = trim_string($payload['paymentStatus'] ?? '');
        if ($paymentStatus !== '') {
            if (!in_array($paymentStatus, ['pending', 'paid', 'confirmed', 'failed', 'refunded'], true)) {
                json_response(['ok' => false, 'message' => 'Invalid payment status.'], 422);
            }
            $sets[] = 'payment_status = ?';
            $params[] = $paymentStatus;
        }

        $paymentRef = trim_string($payload['paymentRef'] ?? $payload['mpesaReference'] ?? '');
        if ($paymentRef !== '') {
            $sets[] = 'mpesa_reference = ?';
            $sets[] = 'mpesa_ref = ?';
            $params[] = $paymentRef;
            $params[] = $paymentRef;
        }

        if (!$sets) {
            json_response(['ok' => false, 'message' => 'No updates provided.'], 422);
        }

        $params[] = trim_string($payload['id']);
        $stmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE public_id = ?');
        $stmt->execute($params);
        json_response(['ok' => true]);
    }

    if ($method === 'DELETE') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['id']);
        $id = trim_string($payload['id']);
        $claims = current_auth_claims();
        if (strtolower((string) ($claims['role'] ?? '')) === 'seller') {
            $orderCheck = $pdo->prepare(
                'SELECT COUNT(*)
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 WHERE o.public_id = ? AND oi.store_public_id = ?'
            );
            $orderCheck->execute([$id, (string) ($claims['businessId'] ?? '')]);
            if ((int) $orderCheck->fetchColumn() < 1) {
                json_response(['ok' => false, 'message' => 'You can only delete orders for your approved business.'], 403);
            }
        }
        $stmt = $pdo->prepare('DELETE FROM orders WHERE public_id = ?');
        $stmt->execute([$id]);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    safe_error('Orders request failed.');
}
