<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, [
    'customer',
    'phone',
    'buyerLocation',
    'paymentMethod',
    'paymentStatus',
    'storeName',
    'subtotal',
    'deliveryFee',
    'total',
]);

$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
if (!$items) {
    json_response([
        'ok' => false,
        'message' => 'Order items are required.',
    ], 422);
}
foreach ($items as $item) {
    if (!is_array($item) || int_value($item['quantity'] ?? 0) < 1 || float_value($item['unitPrice'] ?? 0) < 0) {
        json_response(['ok' => false, 'message' => 'Invalid order item.'], 422);
    }
}
if (float_value($payload['subtotal']) < 0 || float_value($payload['deliveryFee']) < 0 || float_value($payload['total']) < 0) {
    json_response(['ok' => false, 'message' => 'Invalid order totals.'], 422);
}

$routeBreakdown = is_array($payload['routeBreakdown'] ?? null) ? $payload['routeBreakdown'] : [];
$publicId = trim_string($payload['id'] ?? '');
if ($publicId === '') {
    $publicId = generate_public_id('order');
}

try {
    $pdo = tamu_pdo();
    $pdo->beginTransaction();

    $insertOrder = $pdo->prepare(
        'INSERT INTO orders
        (
            public_id,
            customer_name,
            customer_phone,
            buyer_location,
            buyer_latitude,
            buyer_longitude,
            payment_method,
            payment_status,
            mpesa_name,
            mpesa_number,
            mpesa_reference,
            notes,
            store_summary,
            subtotal,
            delivery_fee,
            total,
            status
        )
        VALUES
        (
            :public_id,
            :customer_name,
            :customer_phone,
            :buyer_location,
            :buyer_latitude,
            :buyer_longitude,
            :payment_method,
            :payment_status,
            :mpesa_name,
            :mpesa_number,
            :mpesa_reference,
            :notes,
            :store_summary,
            :subtotal,
            :delivery_fee,
            :total,
            :status
        )'
    );

    $insertOrder->execute([
        'public_id' => $publicId,
        'customer_name' => safe_text($payload['customer'], 120),
        'customer_phone' => safe_text($payload['phone'], 40),
        'buyer_location' => safe_text($payload['buyerLocation'], 220),
        'buyer_latitude' => float_value($payload['buyerLatitude'] ?? 0),
        'buyer_longitude' => float_value($payload['buyerLongitude'] ?? 0),
        'payment_method' => safe_text($payload['paymentMethod'], 40),
        'payment_status' => safe_text($payload['paymentStatus'] ?? 'pending', 40),
        'mpesa_name' => safe_text($payload['mpesaName'] ?? '', 120),
        'mpesa_number' => safe_text($payload['mpesaNumber'] ?? $payload['phone'], 40),
        'mpesa_reference' => safe_text($payload['mpesaReference'] ?? '', 120),
        'notes' => safe_text($payload['note'] ?? '', 500),
        'store_summary' => safe_text($payload['storeName'], 220),
        'subtotal' => float_value($payload['subtotal']),
        'delivery_fee' => float_value($payload['deliveryFee']),
        'total' => float_value($payload['total']),
        'status' => safe_text($payload['status'] ?? 'pending_payment', 40),
    ]);

    $orderId = (int) $pdo->lastInsertId();

    $insertItem = $pdo->prepare(
        'INSERT INTO order_items
        (
            order_id,
            product_public_id,
            product_name,
            store_public_id,
            store_name,
            quantity,
            unit_price,
            line_total
        )
        VALUES
        (
            :order_id,
            :product_public_id,
            :product_name,
            :store_public_id,
            :store_name,
            :quantity,
            :unit_price,
            :line_total
        )'
    );

    foreach ($items as $item) {
        $insertItem->execute([
            'order_id' => $orderId,
            'product_public_id' => safe_text($item['productId'] ?? '', 120),
            'product_name' => safe_text($item['productName'] ?? '', 150),
            'store_public_id' => safe_text($item['storeId'] ?? '', 120),
            'store_name' => safe_text($item['storeName'] ?? '', 150),
            'quantity' => int_value($item['quantity'] ?? 0),
            'unit_price' => float_value($item['unitPrice'] ?? 0),
            'line_total' => float_value($item['lineTotal'] ?? 0),
        ]);
    }

    if ($routeBreakdown) {
        $insertRoute = $pdo->prepare(
            'INSERT INTO order_route_breakdown
            (
                order_id,
                store_public_id,
                store_name,
                distance_km,
                route_fee,
                quantity,
                subtotal
            )
            VALUES
            (
                :order_id,
                :store_public_id,
                :store_name,
                :distance_km,
                :route_fee,
                :quantity,
                :subtotal
            )'
        );

        foreach ($routeBreakdown as $route) {
            $insertRoute->execute([
                'order_id' => $orderId,
                'store_public_id' => safe_text($route['storeId'] ?? '', 120),
                'store_name' => safe_text($route['storeName'] ?? '', 150),
                'distance_km' => float_value($route['distanceKm'] ?? 0),
                'route_fee' => float_value($route['fee'] ?? 0),
                'quantity' => int_value($route['quantity'] ?? 0),
                'subtotal' => float_value($route['subtotal'] ?? 0),
            ]);
        }
    }

    if (table_exists($pdo, 'payments')) {
        $insertPayment = $pdo->prepare(
            'INSERT INTO payments (order_public_id, business_id, method, reference, amount, status)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $businessPayments = is_array($payload['businessPayments'] ?? null) ? $payload['businessPayments'] : [];
        foreach ($businessPayments as $payment) {
            $reference = safe_text($payment['reference'] ?? $payload['mpesaReference'] ?? '', 120);
            if ($reference === '') {
                continue;
            }
            $paymentStatus = safe_text($payment['status'] ?? 'submitted', 40);
            if ($paymentStatus === 'pending_payment') {
                $paymentStatus = 'pending';
            }
            $insertPayment->execute([
                $publicId,
                safe_text($payment['storeId'] ?? $payment['businessId'] ?? '', 120),
                safe_text($payment['method'] ?? $payload['paymentMethod'], 40),
                $reference,
                float_value($payment['amount'] ?? 0),
                $paymentStatus,
            ]);
        }
    }

    if (table_exists($pdo, 'deliveries')) {
        $insertDelivery = $pdo->prepare(
            'INSERT INTO deliveries (order_public_id, status, distance_km, delivery_fee)
             VALUES (?, ?, ?, ?)'
        );
        $maxDistance = 0.0;
        foreach ($routeBreakdown as $route) {
            $maxDistance = max($maxDistance, float_value($route['distanceKm'] ?? 0));
        }
        $insertDelivery->execute([
            $publicId,
            safe_text($payload['deliveryStatus'] ?? 'pending', 40),
            $maxDistance,
            float_value($payload['deliveryFee']),
        ]);
    }

    if (table_exists($pdo, 'cart') && trim_string($payload['sessionId'] ?? '') !== '') {
        $clearCart = $pdo->prepare('DELETE FROM cart WHERE session_id = ?');
        $clearCart->execute([trim_string($payload['sessionId'])]);
    }

    $pdo->commit();

    json_response([
        'ok' => true,
        'message' => 'Order saved.',
        'order' => [
            'id' => $orderId,
            'publicId' => $publicId,
        ],
    ], 201);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    safe_error('Failed to save order.');
}
