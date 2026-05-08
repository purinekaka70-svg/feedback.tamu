<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['email', 'password']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'users')) {
        json_response(['ok' => false, 'message' => 'Users table is not installed.'], 500);
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([trim_string($payload['email'])]);
    $user = $stmt->fetch();

    if (!$user || !$user['password'] || !password_verify((string) $payload['password'], (string) $user['password'])) {
        json_response(['ok' => false, 'message' => 'Invalid credentials.'], 401);
    }

    if (in_array($user['status'], ['pending', 'rejected', 'blocked'], true)) {
        json_response(['ok' => false, 'message' => 'Account is not approved.', 'status' => $user['status']], 403);
    }

    session_start();
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role'] = $user['role'];

    json_response([
        'ok' => true,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? '',
            'role' => $user['role'],
            'status' => $user['status'],
        ],
    ]);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Login failed.', 'error' => $error->getMessage()], 500);
}
