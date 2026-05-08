<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'users')) {
        json_response(['ok' => false, 'message' => 'Users table is not installed.'], 500);
    }

    if ($method === 'GET') {
        require_auth_roles(['admin']);
        $role = trim_string($_GET['role'] ?? '');
        $sql = 'SELECT id, name, phone, email, role, status, firebase_uid, created_at FROM users';
        $params = [];
        if ($role !== '') {
            $sql .= ' WHERE role = ?';
            $params[] = $role;
        }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['ok' => true, 'users' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        require_auth_roles(['admin']);
        $payload = read_json_input();
        require_fields($payload, ['name', 'email', 'role']);
        $email = safe_email($payload['email']);
        require_valid_email($email);
        $password = trim_string($payload['password'] ?? '');
        if ($password !== '' && strlen($password) < 8) {
            json_response(['ok' => false, 'message' => 'Password must be at least 8 characters.'], 422);
        }
        $role = safe_text($payload['role'], 40);
        if (!in_array($role, ['admin', 'seller', 'customer', 'employee'], true)) {
            json_response(['ok' => false, 'message' => 'Invalid user role.'], 422);
        }
        $hash = $password !== ''
            ? password_hash($password, PASSWORD_DEFAULT)
            : null;
        $stmt = $pdo->prepare(
            'INSERT INTO users (name, phone, email, password, role, status, firebase_uid)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                phone = VALUES(phone),
                password = COALESCE(VALUES(password), password),
                role = VALUES(role),
                status = VALUES(status),
                firebase_uid = VALUES(firebase_uid)'
        );
        $stmt->execute([
            safe_text($payload['name'], 120),
            safe_text($payload['phone'] ?? '', 40),
            $email,
            $hash,
            $role,
            safe_text($payload['status'] ?? 'active', 40),
            safe_text($payload['firebaseUid'] ?? '', 160),
        ]);
        json_response(['ok' => true, 'user' => ['id' => (int) $pdo->lastInsertId()]], 201);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    safe_error('Users request failed.');
}
