<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';
ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['storeName', 'email', 'password', 'latitude', 'longitude']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'users') || !table_exists($pdo, 'businesses')) {
        json_response(['ok' => false, 'message' => 'Users/businesses tables are not installed.'], 500);
    }

    $check = $pdo->prepare('SELECT id FROM businesses WHERE email = ?');
    $check->execute([$payload['email']]);
    if ($check->fetch()) {
        json_response(['ok' => false, 'message' => 'Email already registered.'], 400);
    }

    $id = 'seller-' . bin2hex(random_bytes(4));
    $passwordHash = password_hash($payload['password'], PASSWORD_DEFAULT);
    $paymentMethods = json_encode($payload['paymentMethods'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $pdo->beginTransaction();

    $user = $pdo->prepare(
        "INSERT INTO users (name, phone, email, password, role, status)
         VALUES (?, ?, ?, ?, 'seller', 'pending')"
    );
    $user->execute([
        $payload['ownerName'] ?? $payload['storeName'],
        $payload['phone'] ?? '',
        $payload['email'],
        $passwordHash,
    ]);
    $userId = (int) $pdo->lastInsertId();

    $stmt = $pdo->prepare(
        'INSERT INTO businesses
         (user_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
          payment_methods, till_number, pochi_number, bank_account, logo, logo_image, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $userId,
        $payload['storeName'],
        $payload['ownerName'] ?? '',
        $payload['phone'] ?? '',
        $payload['email'],
        $payload['businessType'] ?? 'retail',
        $payload['location'] ?? 'Nairobi',
        $payload['latitude'],
        $payload['longitude'],
        $paymentMethods,
        $payload['tillNumber'] ?? '',
        $payload['pochiNumber'] ?? '',
        $payload['bankAccount'] ?? ($payload['cardAccount'] ?? ''),
        $payload['logoImage'] ?? ($payload['logo'] ?? ''),
        $payload['logoImage'] ?? ($payload['logo'] ?? ''),
        'pending'
    ]);
    $id = (string) $pdo->lastInsertId();

    $pdo->commit();

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
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response(['ok' => false, 'message' => 'Database error.', 'error' => $e->getMessage()], 500);
}
