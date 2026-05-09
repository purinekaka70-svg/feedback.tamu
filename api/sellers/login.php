<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['email', 'password']);
$email = safe_email($payload['email']);
require_valid_email($email);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'businesses') || !table_exists($pdo, 'users')) {
        json_response(['ok' => false, 'message' => 'Business table is not installed.'], 500);
    }

    $stmt = $pdo->prepare(
        "SELECT b.*, u.password, u.status AS user_status
         FROM businesses b
         LEFT JOIN users u ON u.id = b.user_id OR u.email = b.email
         WHERE b.email = ?
         LIMIT 1"
    );
    $stmt->execute([$email]);
    $seller = $stmt->fetch();

    $hash = (string) ($seller['password'] ?? '');
    if (!$seller || $hash === '' || !password_verify((string) $payload['password'], $hash)) {
        json_response(['ok' => false, 'message' => 'Invalid seller credentials.'], 401);
    }

    $sellerStatus = (string) ($seller['status'] ?? 'pending');
    if ($sellerStatus === 'pending') {
        json_response(['ok' => false, 'message' => 'Your business account is waiting for admin approval.', 'status' => $sellerStatus], 403);
    }
    if ($sellerStatus === 'rejected') {
        json_response(['ok' => false, 'message' => 'Your business account was rejected. Contact admin for help.', 'status' => $sellerStatus], 403);
    }
    if ($sellerStatus === 'blocked') {
        json_response(['ok' => false, 'message' => 'Your business account is blocked. Contact admin for help.', 'status' => $sellerStatus], 403);
    }
    if ($sellerStatus !== 'approved') {
        json_response(['ok' => false, 'message' => 'Your business account is not approved.', 'status' => $sellerStatus], 403);
    }
    if (strtolower((string) ($seller['user_status'] ?? 'approved')) !== 'approved') {
        json_response(['ok' => false, 'message' => 'Your seller login is not approved yet.', 'status' => $seller['user_status'] ?? 'pending'], 403);
    }

    secure_session_start();
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $seller['user_id'] ?? null;
        $_SESSION['business_id'] = $seller['id'];
        $_SESSION['role'] = 'seller';
        session_write_close();
    }
    issue_auth_cookie([
        'userId' => isset($seller['user_id']) ? (int) $seller['user_id'] : null,
        'businessId' => (int) $seller['id'],
        'role' => 'seller',
    ]);

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
    safe_error('Seller login failed.');
}
