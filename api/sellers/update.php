<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);
$payload = read_json_input();
require_fields($payload, ['id']);
$claims = current_auth_claims();
if (strtolower((string) ($claims['role'] ?? '')) === 'seller'
    && (string) ($claims['businessId'] ?? '') !== trim_string($payload['id'])) {
    json_response(['ok' => false, 'message' => 'You can only update your own business settings.'], 403);
}

try {
    $pdo = tamu_pdo();
    $table = 'businesses';
    if (!table_exists($pdo, $table)) {
        json_response(['ok' => false, 'message' => 'Business table is not installed.'], 500);
    }

    $id = trim_string($payload['id']);
    $updates = [];
    $params = [];

    $fieldMap = [
        'location' => 'location_name',
        'latitude' => 'latitude',
        'longitude' => 'longitude',
        'tillNumber' => 'till_number',
        'pochiNumber' => 'pochi_number',
        'bankAccount' => 'bank_account',
        'deliveryAvailability' => 'delivery_availability',
        'deliveryNotes' => 'delivery_notes',
    ];

    foreach ($fieldMap as $payloadKey => $column) {
        if (!array_key_exists($payloadKey, $payload) || !column_exists($pdo, $table, $column)) {
            continue;
        }
        $updates[] = "{$column} = ?";
        $params[] = in_array($column, ['latitude', 'longitude'], true)
            ? float_value($payload[$payloadKey])
            : safe_text($payload[$payloadKey], 500);
    }

    if (array_key_exists('paymentMethods', $payload) && column_exists($pdo, $table, 'payment_methods')) {
        $updates[] = 'payment_methods = ?';
        $params[] = json_encode(string_array($payload['paymentMethods']), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    if (!$updates) {
        json_response(['ok' => false, 'message' => 'No supported seller fields were provided.'], 422);
    }

    $params[] = $id;
    $stmt = $pdo->prepare("UPDATE {$table} SET " . implode(', ', $updates) . ' WHERE id = ?');
    $stmt->execute($params);

    $select = $pdo->prepare("SELECT * FROM {$table} WHERE id = ? LIMIT 1");
    $select->execute([$id]);
    $seller = $select->fetch();

    json_response([
        'ok' => true,
        'seller' => [
            'id' => $seller['id'] ?? $id,
            'businessId' => $seller['id'] ?? $id,
            'name' => $seller['store_name'] ?? $seller['name'] ?? '',
            'storeName' => $seller['store_name'] ?? $seller['name'] ?? '',
            'ownerName' => $seller['owner_name'] ?? '',
            'phone' => $seller['phone'] ?? '',
            'email' => $seller['email'] ?? '',
            'type' => $seller['business_type'] ?? $seller['type'] ?? 'retail',
            'businessType' => $seller['business_type'] ?? $seller['type'] ?? 'retail',
            'location' => $seller['location'] ?? $seller['location_name'] ?? '',
            'county' => $seller['location'] ?? $seller['location_name'] ?? '',
            'latitude' => (float) ($seller['latitude'] ?? 0),
            'longitude' => (float) ($seller['longitude'] ?? 0),
            'paymentOptions' => json_decode($seller['payment_methods'] ?? '[]', true) ?: [],
            'tillNumber' => $seller['till_number'] ?? '',
            'pochiNumber' => $seller['pochi_number'] ?? '',
            'bankAccount' => $seller['bank_account'] ?? '',
            'deliveryAvailability' => $seller['delivery_availability'] ?? '',
            'deliveryNotes' => $seller['delivery_notes'] ?? '',
            'logo' => $seller['logo_image'] ?? '',
            'logoImage' => $seller['logo_image'] ?? '',
            'status' => $seller['status'] ?? '',
        ],
    ]);
} catch (PDOException $error) {
    safe_error('Failed to update seller.');
}
