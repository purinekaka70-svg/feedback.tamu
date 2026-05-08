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
        'customer_name' => trim_string($payload['customer']),
        'customer_phone' => trim_string($payload['phone']),
        'buyer_location' => trim_string($payload['buyerLocation']),
        'buyer_latitude' => float_value($payload['buyerLatitude'] ?? 0),
        'buyer_longitude' => float_value($payload['buyerLongitude'] ?? 0),
        'payment_method' => trim_string($payload['paymentMethod']),
        'payment_status' => trim_string($payload['paymentStatus'] ?? 'pending'),
        'mpesa_name' => trim_string($payload['mpesaName'] ?? ''),
        'mpesa_number' => trim_string($payload['mpesaNumber'] ?? $payload['phone']),
        'mpesa_reference' => trim_string($payload['mpesaReference'] ?? ''),
        'notes' => trim_string($payload['note'] ?? ''),
        'store_summary' => trim_string($payload['storeName']),
        'subtotal' => float_value($payload['subtotal']),
        'delivery_fee' => float_value($payload['deliveryFee']),
        'total' => float_value($payload['total']),
        'status' => trim_string($payload['status'] ?? 'pending'),
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
            'product_public_id' => trim_string($item['productId'] ?? ''),
            'product_name' => trim_string($item['productName'] ?? ''),
            'store_public_id' => trim_string($item['storeId'] ?? ''),
            'store_name' => trim_string($item['storeName'] ?? ''),
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
                'store_public_id' => trim_string($route['storeId'] ?? ''),
                'store_name' => trim_string($route['storeName'] ?? ''),
                'distance_km' => float_value($route['distanceKm'] ?? 0),
                'route_fee' => float_value($route['fee'] ?? 0),
                'quantity' => int_value($route['quantity'] ?? 0),
                'subtotal' => float_value($route['subtotal'] ?? 0),
            ]);
        }
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

    json_response([
        'ok' => false,
        'message' => 'Failed to save order.',
        'error' => $error->getMessage(),
    ], 500);
}
