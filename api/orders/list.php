<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

try {
    $pdo = tamu_pdo();
    $where = '';
    $params = [];
    $businessId = trim_string($_GET['businessId'] ?? $_GET['storeId'] ?? '');
    if ($businessId !== '') {
        $where = 'WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.store_public_id = ?)';
        $params[] = $businessId;
    }

    $stmt = $pdo->prepare(
        "SELECT o.*
         FROM orders o
         {$where}
         ORDER BY o.created_at DESC"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $orderIds = array_map(static function (array $row): int {
        return (int) $row['id'];
    }, $rows);
    $itemsByOrder = [];
    $routesByOrder = [];

    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));

        $itemStmt = $pdo->prepare("SELECT * FROM order_items WHERE order_id IN ($placeholders)");
        $itemStmt->execute($orderIds);
        foreach ($itemStmt->fetchAll() as $item) {
            $itemsByOrder[(int) $item['order_id']][] = [
                'productId' => $item['product_public_id'],
                'productName' => $item['product_name'],
                'name' => $item['product_name'],
                'storeId' => $item['store_public_id'],
                'businessId' => $item['store_public_id'],
                'storeName' => $item['store_name'],
                'quantity' => (int) $item['quantity'],
                'unitPrice' => (float) $item['unit_price'],
                'price' => (float) $item['unit_price'],
                'lineTotal' => (float) $item['line_total'],
                'total' => (float) $item['line_total'],
            ];
        }

        if (table_exists($pdo, 'order_route_breakdown')) {
            $routeStmt = $pdo->prepare("SELECT * FROM order_route_breakdown WHERE order_id IN ($placeholders)");
            $routeStmt->execute($orderIds);
            foreach ($routeStmt->fetchAll() as $route) {
                $routesByOrder[(int) $route['order_id']][] = [
                    'storeId' => $route['store_public_id'],
                    'storeName' => $route['store_name'],
                    'distanceKm' => (float) $route['distance_km'],
                    'fee' => (float) $route['route_fee'],
                    'quantity' => (int) $route['quantity'],
                    'subtotal' => (float) $route['subtotal'],
                ];
            }
        }
    }

    $orders = array_map(static function (array $row) use ($itemsByOrder, $routesByOrder): array {
        $id = (int) $row['id'];
        return [
            'id' => $row['public_id'],
            'userId' => $row['customer_phone'],
            'customer' => $row['customer_name'],
            'phone' => $row['customer_phone'],
            'buyerLocation' => $row['buyer_location'],
            'buyerLatitude' => (float) $row['buyer_latitude'],
            'buyerLongitude' => (float) $row['buyer_longitude'],
            'paymentMethod' => $row['payment_method'],
            'paymentStatus' => $row['payment_status'],
            'paymentRef' => $row['mpesa_reference'] ?? '',
            'mpesaName' => $row['mpesa_name'] ?? '',
            'mpesaNumber' => $row['mpesa_number'] ?? $row['customer_phone'],
            'mpesaReference' => $row['mpesa_reference'] ?? '',
            'note' => $row['notes'] ?? '',
            'storeName' => $row['store_summary'],
            'stores' => array_values(array_unique(array_map(static function (array $item): string {
                return $item['storeName'];
            }, $itemsByOrder[$id] ?? []))),
            'subtotal' => (float) $row['subtotal'],
            'deliveryFee' => (float) $row['delivery_fee'],
            'total' => (float) $row['total'],
            'status' => $row['status'],
            'deliveryStatus' => $row['status'] === 'delivered' ? 'delivered' : ($row['status'] === 'processing' ? 'processing' : 'pending'),
            'items' => $itemsByOrder[$id] ?? [],
            'routeBreakdown' => $routesByOrder[$id] ?? [],
            'deliveryPayment' => [
                'tillNumber' => '7312380',
                'amount' => (float) $row['delivery_fee'],
                'reference' => $row['mpesa_reference'] ?? '',
                'status' => $row['payment_status'],
            ],
            'createdAt' => $row['created_at'],
        ];
    }, $rows);

    json_response(['ok' => true, 'orders' => $orders]);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Failed to load orders.', 'error' => $error->getMessage()], 500);
}
