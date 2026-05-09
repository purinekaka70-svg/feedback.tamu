<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

function normalize_county_name(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '', $value) ?: '';
    return $value;
}

function order_matches_county(array $order, array $items, array $businessById, string $county): bool
{
    $target = normalize_county_name($county);
    if ($target === '') {
        return false;
    }

    $values = [
        $order['buyer_location'] ?? '',
        $order['store_summary'] ?? '',
    ];

    foreach ($items as $item) {
        $values[] = $item['store_name'] ?? '';
        $business = $businessById[(string) ($item['store_public_id'] ?? '')] ?? null;
        if ($business) {
            $values[] = $business['location_name'] ?? '';
            $values[] = $business['county'] ?? '';
        }
    }

    foreach ($values as $value) {
        if (normalize_county_name((string) $value) === $target || str_contains(normalize_county_name((string) $value), $target)) {
            return true;
        }
    }

    return false;
}

function employee_claims(): array
{
    $token = bearer_token();
    $claims = $token !== '' ? verify_firebase_id_token($token) : [];
    if (!$claims) {
        json_response(['ok' => false, 'message' => 'Valid Firebase employee token is required.'], 401);
    }
    return $claims;
}

function firestore_field_value(array $field)
{
    foreach (['stringValue', 'booleanValue', 'integerValue', 'doubleValue'] as $key) {
        if (array_key_exists($key, $field)) {
            return $field[$key];
        }
    }
    return null;
}

function employee_firestore_record(string $token, string $uid): array
{
    $projectId = firebase_project_id();
    if ($projectId === '' || $uid === '') {
        return [];
    }

    $url = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($projectId)
        . '/databases/(default)/documents/employees/' . rawurlencode($uid);
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5,
            'header' => "Authorization: Bearer {$token}\r\nAccept: application/json\r\n",
        ],
    ]);
    $json = @file_get_contents($url, false, $context);
    $data = $json ? (json_decode($json, true) ?: []) : [];
    $fields = is_array($data['fields'] ?? null) ? $data['fields'] : [];
    $record = ['id' => $uid];
    foreach ($fields as $key => $field) {
        $record[$key] = is_array($field) ? firestore_field_value($field) : null;
    }
    if ($record && isset($record['email'])) {
        return $record;
    }

    $queryUrl = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($projectId)
        . '/databases/(default)/documents:runQuery';
    $query = json_encode([
        'structuredQuery' => [
            'from' => [['collectionId' => 'employees']],
            'where' => [
                'fieldFilter' => [
                    'field' => ['fieldPath' => 'uid'],
                    'op' => 'EQUAL',
                    'value' => ['stringValue' => $uid],
                ],
            ],
            'limit' => 1,
        ],
    ]);
    $queryContext = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 5,
            'header' => "Authorization: Bearer {$token}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => $query,
        ],
    ]);
    $queryJson = @file_get_contents($queryUrl, false, $queryContext);
    $matches = $queryJson ? (json_decode($queryJson, true) ?: []) : [];
    $doc = is_array($matches[0]['document'] ?? null) ? $matches[0]['document'] : [];
    $fields = is_array($doc['fields'] ?? null) ? $doc['fields'] : [];
    $record = ['id' => basename((string) ($doc['name'] ?? $uid))];
    foreach ($fields as $key => $field) {
        $record[$key] = is_array($field) ? firestore_field_value($field) : null;
    }
    return $record;
}

function employee_request_payload(): array
{
    if (($GLOBALS['employee_payload_loaded'] ?? false) === true) {
        return $GLOBALS['employee_payload'] ?? [];
    }
    $GLOBALS['employee_payload_loaded'] = true;
    $GLOBALS['employee_payload'] = read_json_input();
    return $GLOBALS['employee_payload'];
}

function approved_employee_county(array $employee): string
{
    $county = safe_text($employee['county'] ?? '', 80);
    if ($county === '') {
        json_response(['ok' => false, 'message' => 'Employee county is not configured.'], 403);
    }
    if (($employee['approved'] ?? false) !== true || ($employee['active'] ?? false) !== true) {
        json_response(['ok' => false, 'message' => 'Employee account is not approved or active.'], 403);
    }
    if (strtolower((string) ($employee['role'] ?? 'employee')) !== 'employee') {
        json_response(['ok' => false, 'message' => 'Only employee accounts can access delivery orders.'], 403);
    }
    return $county;
}

$token = bearer_token();
$claims = employee_claims();
$uid = (string) ($claims['user_id'] ?? $claims['sub'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    $employee = employee_firestore_record($token, $uid);
    $county = approved_employee_county($employee);

    $businessById = [];
    if (table_exists($pdo, 'businesses')) {
        $businessColumns = 'id, name, location_name';
        if (column_exists($pdo, 'businesses', 'county')) {
            $businessColumns .= ', county';
        }
        foreach ($pdo->query("SELECT {$businessColumns} FROM businesses")->fetchAll() as $business) {
            $businessById[(string) $business['id']] = $business;
        }
    }

    if ($method === 'POST') {
        $payload = employee_request_payload();
        require_fields($payload, ['id']);
        $orderId = trim_string($payload['id']);

        $itemStmt = $pdo->prepare(
            'SELECT oi.*
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE o.public_id = ?'
        );
        $itemStmt->execute([$orderId]);
        $items = $itemStmt->fetchAll();

        $orderStmt = $pdo->prepare('SELECT * FROM orders WHERE public_id = ? LIMIT 1');
        $orderStmt->execute([$orderId]);
        $order = $orderStmt->fetch();
        if (!$order || !order_matches_county($order, $items, $businessById, $county)) {
            json_response(['ok' => false, 'message' => 'Order is outside your assigned county.'], 403);
        }

        $status = trim_string($payload['status'] ?? '');
        $deliveryStatus = trim_string($payload['deliveryStatus'] ?? $status);
        $allowedStatuses = ['processing', 'delivered', 'cancelled'];
        if ($status !== '' && !in_array($status, $allowedStatuses, true)) {
            json_response(['ok' => false, 'message' => 'Invalid employee order status.'], 422);
        }

        $sets = [];
        $params = [];
        if ($status !== '') {
            $sets[] = 'status = ?';
            $params[] = $status;
        }
        if (!$sets) {
            json_response(['ok' => false, 'message' => 'No employee updates provided.'], 422);
        }
        $params[] = $orderId;
        $updateOrder = $pdo->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE public_id = ?');
        $updateOrder->execute($params);

        if (table_exists($pdo, 'deliveries')) {
            $deliveryUpdate = $pdo->prepare(
                'UPDATE deliveries
                 SET status = ?, employee_id = COALESCE(employee_id, NULL)
                 WHERE order_public_id = ?'
            );
            $deliveryUpdate->execute([$deliveryStatus ?: $status, $orderId]);
        }

        json_response([
            'ok' => true,
            'updatedBy' => $uid,
            'county' => $county,
        ]);
    }

    if ($method !== 'GET') {
        json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
    }

    $rows = $pdo->query('SELECT * FROM orders ORDER BY created_at DESC')->fetchAll();
    $orderIds = array_map(static fn(array $row): int => (int) $row['id'], $rows);
    $itemsByOrder = [];
    $routesByOrder = [];

    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $itemStmt = $pdo->prepare("SELECT * FROM order_items WHERE order_id IN ($placeholders)");
        $itemStmt->execute($orderIds);
        foreach ($itemStmt->fetchAll() as $item) {
            $itemsByOrder[(int) $item['order_id']][] = $item;
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

    $orders = [];
    foreach ($rows as $row) {
        $id = (int) $row['id'];
        $items = $itemsByOrder[$id] ?? [];
        if (!order_matches_county($row, $items, $businessById, $county)) {
            continue;
        }

        $orders[] = [
            'id' => $row['public_id'],
            'userId' => $row['customer_phone'],
            'customer' => $row['customer_name'],
            'phone' => $row['customer_phone'],
            'buyerLocation' => $row['buyer_location'],
            'county' => $county,
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
            'stores' => array_values(array_unique(array_map(static fn(array $item): string => (string) $item['store_name'], $items))),
            'subtotal' => (float) $row['subtotal'],
            'deliveryFee' => (float) $row['delivery_fee'],
            'total' => (float) $row['total'],
            'status' => $row['status'],
            'deliveryStatus' => $row['status'] === 'delivered' ? 'delivered' : ($row['status'] === 'processing' ? 'processing' : 'pending'),
            'items' => array_map(static fn(array $item): array => [
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
            ], $items),
            'routeBreakdown' => $routesByOrder[$id] ?? [],
            'deliveryPayment' => [
                'tillNumber' => '7312380',
                'amount' => (float) $row['delivery_fee'],
                'reference' => $row['mpesa_reference'] ?? '',
                'status' => $row['payment_status'],
            ],
            'createdAt' => $row['created_at'],
        ];
    }

    json_response(['ok' => true, 'orders' => $orders, 'county' => $county]);
} catch (PDOException $error) {
    safe_error('Failed to load employee orders.');
}
