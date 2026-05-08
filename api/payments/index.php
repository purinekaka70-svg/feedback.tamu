<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'payments')) {
        json_response(['ok' => false, 'message' => 'Payments table is not installed.'], 500);
    }

    if ($method === 'GET') {
        require_auth_roles(['admin', 'seller']);
        $businessId = trim_string($_GET['businessId'] ?? '');
        $sql = 'SELECT * FROM payments';
        $params = [];
        if ($businessId !== '') {
            $sql .= ' WHERE business_id = ?';
            $params[] = $businessId;
        }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['ok' => true, 'payments' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        require_auth_roles(['admin', 'seller', 'customer']);
        $payload = read_json_input();
        require_fields($payload, ['orderId', 'method', 'reference', 'amount']);
        $stmt = $pdo->prepare(
            'INSERT INTO payments (order_public_id, business_id, method, reference, amount, status)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            safe_text($payload['orderId'], 120),
            safe_text($payload['businessId'] ?? '', 120),
            safe_text($payload['method'], 40),
            safe_text($payload['reference'], 120),
            float_value($payload['amount']),
            safe_text($payload['status'] ?? 'submitted', 40),
        ]);
        json_response(['ok' => true, 'payment' => ['id' => (int) $pdo->lastInsertId()]], 201);
    }

    if ($method === 'PATCH') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['id', 'status']);
        $status = safe_text($payload['status'], 40);
        if (!in_array($status, ['submitted', 'pending', 'paid', 'confirmed', 'failed', 'refunded'], true)) {
            json_response(['ok' => false, 'message' => 'Invalid payment status.'], 422);
        }
        $stmt = $pdo->prepare('UPDATE payments SET status = ? WHERE id = ?');
        $stmt->execute([$status, int_value($payload['id'])]);
        json_response(['ok' => true]);
    }

    if ($method === 'DELETE') {
        require_auth_roles(['admin']);
        $payload = read_json_input();
        require_fields($payload, ['id']);
        $stmt = $pdo->prepare('DELETE FROM payments WHERE id = ?');
        $stmt->execute([int_value($payload['id'])]);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    safe_error('Payments request failed.');
}
