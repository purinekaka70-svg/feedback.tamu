<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, ['username', 'password']);

$username = trim_string($payload['username']);
$password = trim_string($payload['password']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'users')) {
        json_response(['ok' => false, 'message' => 'Users table is not installed.'], 500);
    }
    $statement = $pdo->prepare(
        "SELECT id, email, name, password
         FROM users
         WHERE email = :username AND role = 'admin' AND status IN ('approved', 'active')
         LIMIT 1"
    );
    $statement->execute(['username' => $username]);
    $admin = $statement->fetch();

    if (!$admin || !password_verify($password, (string) $admin['password'])) {
        json_response([
            'ok' => false,
            'message' => 'Invalid admin credentials.',
        ], 401);
    }

    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['admin_id'] = $admin['id'];
    }

    json_response([
        'ok' => true,
        'message' => 'Admin login successful.',
        'admin' => [
            'id' => $admin['id'],
            'username' => $admin['email'],
            'displayName' => $admin['name'],
        ],
    ]);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Database connection failed for admin login.',
        'error' => $error->getMessage(),
    ], 500);
}
