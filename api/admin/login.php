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
    $statement = $pdo->prepare(
        'SELECT id, username, display_name, password_hash
         FROM admins
         WHERE username = :username
         LIMIT 1'
    );
    $statement->execute(['username' => $username]);
    $admin = $statement->fetch();

    if (!$admin || !password_verify($password, $admin['password_hash'])) {
        json_response([
            'ok' => false,
            'message' => 'Invalid admin credentials.',
        ], 401);
    }

    session_start();
    $_SESSION['admin_id'] = (int) $admin['id'];

    json_response([
        'ok' => true,
        'message' => 'Admin login successful.',
        'admin' => [
            'id' => (int) $admin['id'],
            'username' => $admin['username'],
            'displayName' => $admin['display_name'],
        ],
    ]);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Database connection failed for admin login.',
        'error' => $error->getMessage(),
    ], 500);
}
