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
        $payload = read_json_input();
        require_fields($payload, ['name', 'email', 'role']);
        $hash = trim_string($payload['password'] ?? '') !== ''
            ? password_hash(trim_string($payload['password']), PASSWORD_DEFAULT)
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
            trim_string($payload['name']),
            trim_string($payload['phone'] ?? ''),
            trim_string($payload['email']),
            $hash,
            trim_string($payload['role']),
            trim_string($payload['status'] ?? 'active'),
            trim_string($payload['firebaseUid'] ?? ''),
        ]);
        json_response(['ok' => true, 'user' => ['id' => (int) $pdo->lastInsertId()]], 201);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Users request failed.', 'error' => $error->getMessage()], 500);
}
