<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['email', 'password']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'businesses') || !table_exists($pdo, 'users')) {
        json_response(['ok' => false, 'message' => 'Business table is not installed.'], 500);
    }

    $stmt = $pdo->prepare(
        "SELECT b.*, u.password
         FROM businesses b
         LEFT JOIN users u ON u.id = b.user_id OR u.email = b.email
         WHERE b.email = ?
         LIMIT 1"
    );
    $stmt->execute([trim_string($payload['email'])]);
    $seller = $stmt->fetch();

    $hash = (string) ($seller['password'] ?? '');
    if (!$seller || $hash === '' || !password_verify((string) $payload['password'], $hash)) {
        json_response(['ok' => false, 'message' => 'Invalid seller credentials.'], 401);
    }

    if (($seller['status'] ?? '') !== 'approved') {
        json_response(['ok' => false, 'message' => 'Seller account is waiting for admin approval.', 'status' => $seller['status']], 403);
    }

    json_response([
        'ok' => true,
        'seller' => [
            'id' => $seller['id'],
            'businessId' => $seller['id'],
            'name' => $seller['store_name'] ?? $seller['name'],
            'storeName' => $seller['store_name'] ?? $seller['name'],
            'ownerName' => $seller['owner_name'],
            'phone' => $seller['phone'],
            'email' => $seller['email'],
            'type' => $seller['business_type'] ?? $seller['type'],
            'businessType' => $seller['business_type'] ?? $seller['type'],
            'location' => $seller['location'] ?? $seller['location_name'],
            'county' => $seller['location'] ?? $seller['location_name'],
            'latitude' => (float) $seller['latitude'],
            'longitude' => (float) $seller['longitude'],
            'paymentOptions' => json_decode($seller['payment_methods'] ?? '[]', true) ?: [],
            'tillNumber' => $seller['till_number'] ?? '',
            'pochiNumber' => $seller['pochi_number'] ?? '',
            'bankAccount' => $seller['bank_account'] ?? '',
            'logo' => $seller['logo_image'] ?? $seller['logo'] ?? '',
            'logoImage' => $seller['logo_image'] ?? $seller['logo'] ?? '',
            'status' => $seller['status'],
        ],
    ]);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Seller login failed.', 'error' => $error->getMessage()], 500);
}
