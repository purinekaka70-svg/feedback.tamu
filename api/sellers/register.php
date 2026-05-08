<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';
ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['storeName', 'email', 'password', 'latitude', 'longitude']);

try {
    $pdo = tamu_pdo();
    $check = $pdo->prepare('SELECT id FROM sellers WHERE email = ?');
    $check->execute([$payload['email']]);
    if ($check->fetch()) {
        json_response(['ok' => false, 'message' => 'Email already registered.'], 400);
    }

    $id = 'seller-' . bin2hex(random_bytes(4));
    $stmt = $pdo->prepare('INSERT INTO sellers (id, store_name, owner_name, phone, email, password_hash, latitude, longitude, business_type, location, payment_methods, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $id,
        $payload['storeName'],
        $payload['ownerName'] ?? '',
        $payload['phone'] ?? '',
        $payload['email'],
        password_hash($payload['password'], PASSWORD_DEFAULT),
        $payload['latitude'],
        $payload['longitude'],
        $payload['businessType'] ?? 'retail',
        $payload['location'] ?? 'Nairobi',
        json_encode($payload['paymentMethods'] ?? []),
        'pending'
    ]);

    json_response([
        'ok' => true,
        'seller' => [
            'id' => $id,
            'storeName' => $payload['storeName'],
            'email' => $payload['email'],
            'status' => 'pending'
        ]
    ]);
} catch (PDOException $e) {
    json_response(['ok' => false, 'message' => 'Database error.', 'error' => $e->getMessage()], 500);
}