<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';
ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['storeName', 'email', 'password', 'latitude', 'longitude']);

$email = safe_email($payload['email']);
require_valid_email($email);
$password = (string) $payload['password'];
if (strlen($password) < 8) {
    json_response(['ok' => false, 'message' => 'Password must be at least 8 characters.'], 422);
}
$logoImage = validate_base64_image($payload['logoImage'] ?? ($payload['logo'] ?? ''), 1048576);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'users') || !table_exists($pdo, 'businesses')) {
        json_response(['ok' => false, 'message' => 'Users/businesses tables are not installed.'], 500);
    }

    $check = $pdo->prepare('SELECT id FROM businesses WHERE email = ?');
    $check->execute([$email]);
    if ($check->fetch()) {
        json_response(['ok' => false, 'message' => 'Email already registered.'], 400);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $paymentMethods = json_encode($payload['paymentMethods'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $pdo->beginTransaction();

    $user = $pdo->prepare(
        "INSERT INTO users (name, phone, email, password, role, status)
         VALUES (?, ?, ?, ?, 'seller', 'pending')"
    );
    $user->execute([
        safe_text($payload['ownerName'] ?? $payload['storeName'], 120),
        safe_text($payload['phone'] ?? '', 40),
        $email,
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
        safe_text($payload['storeName'], 150),
        safe_text($payload['ownerName'] ?? '', 120),
        safe_text($payload['phone'] ?? '', 40),
        $email,
        safe_text($payload['businessType'] ?? 'retail', 50),
        safe_text($payload['location'] ?? 'Nairobi', 120),
        float_value($payload['latitude']),
        float_value($payload['longitude']),
        $paymentMethods,
        safe_text($payload['tillNumber'] ?? '', 80),
        safe_text($payload['pochiNumber'] ?? '', 80),
        safe_text($payload['bankAccount'] ?? ($payload['cardAccount'] ?? ''), 120),
        $logoImage,
        $logoImage,
        'pending'
    ]);
    $id = (string) $pdo->lastInsertId();

    $pdo->commit();

    json_response([
        'ok' => true,
        'seller' => [
            'id' => $id,
            'storeName' => safe_text($payload['storeName'], 150),
            'email' => $email,
            'status' => 'pending'
        ]
    ]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    safe_error('Database error.');
}
