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
        $payload = read_json_input();
        require_fields($payload, ['orderId', 'method', 'reference', 'amount']);
        $stmt = $pdo->prepare(
            'INSERT INTO payments (order_public_id, business_id, method, reference, amount, status)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            trim_string($payload['orderId']),
            trim_string($payload['businessId'] ?? ''),
            trim_string($payload['method']),
            trim_string($payload['reference']),
            float_value($payload['amount']),
            trim_string($payload['status'] ?? 'submitted'),
        ]);
        json_response(['ok' => true, 'payment' => ['id' => (int) $pdo->lastInsertId()]], 201);
    }

    if ($method === 'PATCH') {
        $payload = read_json_input();
        require_fields($payload, ['id', 'status']);
        $stmt = $pdo->prepare('UPDATE payments SET status = ? WHERE id = ?');
        $stmt->execute([trim_string($payload['status']), int_value($payload['id'])]);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Payments request failed.', 'error' => $error->getMessage()], 500);
}
