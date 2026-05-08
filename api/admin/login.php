<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, ['username', 'password']);

$username = safe_email($payload['username']);
$password = trim_string($payload['password']);
require_valid_email($username);

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

    secure_session_start();
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
        $_SESSION['admin_id'] = $admin['id'];
        $_SESSION['user_id'] = $admin['id'];
        $_SESSION['role'] = 'admin';
        session_write_close();
    }
    issue_auth_cookie([
        'userId' => (int) $admin['id'],
        'role' => 'admin',
    ]);

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
    safe_error('Database connection failed for admin login.');
}
