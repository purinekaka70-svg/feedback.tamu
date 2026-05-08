<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);

$allowedStatuses = ['pending_payment', 'paid', 'processing', 'delivered', 'cancelled'];
$status = trim_string($payload['status'] ?? '');
$paymentStatus = trim_string($payload['paymentStatus'] ?? '');
$paymentRef = trim_string($payload['paymentRef'] ?? $payload['mpesaReference'] ?? '');

try {
    $pdo = tamu_pdo();
    $sets = [];
    $params = [];

    if ($status !== '') {
        if (!in_array($status, $allowedStatuses, true)) {
            json_response(['ok' => false, 'message' => 'Invalid order status.'], 422);
        }
        $sets[] = 'status = ?';
        $params[] = $status;
    }
if ($paymentStatus !== '') {
    if (!in_array($paymentStatus, ['pending', 'paid', 'confirmed', 'failed', 'refunded'], true)) {
        json_response(['ok' => false, 'message' => 'Invalid payment status.'], 422);
    }
    $sets[] = 'payment_status = ?';
    $params[] = $paymentStatus;
}
    if ($paymentRef !== '') {
        $sets[] = 'mpesa_reference = ?';
        $params[] = $paymentRef;
    }

    if (!$sets) {
        json_response(['ok' => false, 'message' => 'No updates provided.'], 422);
    }

    $params[] = trim_string($payload['id']);
    $stmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE public_id = ?');
    $stmt->execute($params);

    $orderId = trim_string($payload['id']);
    if ($paymentStatus !== '' && table_exists($pdo, 'payments')) {
        $paymentUpdate = $pdo->prepare('UPDATE payments SET status = ? WHERE order_public_id = ?');
        $paymentUpdate->execute([$paymentStatus, $orderId]);
    }

    if ($status !== '' && table_exists($pdo, 'deliveries')) {
        $deliveryStatus = $status === 'delivered' ? 'delivered' : ($status === 'cancelled' ? 'cancelled' : 'processing');
        $deliveryUpdate = $pdo->prepare('UPDATE deliveries SET status = ? WHERE order_public_id = ?');
        $deliveryUpdate->execute([$deliveryStatus, $orderId]);
    }

    json_response(['ok' => true]);
} catch (PDOException $error) {
    safe_error('Failed to update order.');
}
