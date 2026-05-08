<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';
require_auth_roles(['admin']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $status = safe_text($_GET['status'] ?? '', 40);
    try {
        $pdo = tamu_pdo();
        if (!table_exists($pdo, 'businesses')) {
            json_response(['ok' => false, 'message' => 'Businesses table is not installed.'], 500);
        }
        $sql = 'SELECT * FROM businesses';
        $params = [];
        if ($status !== '') {
            $sql .= ' WHERE status = ?';
            $params[] = $status;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $sellers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Decode JSON fields for frontend
        foreach ($sellers as &$s) {
            $s['paymentOptions'] = json_decode($s['payment_methods'] ?? '[]', true);
            $s['store_name'] = $s['store_name'] ?? $s['name'] ?? '';
            $s['business_type'] = $s['business_type'] ?? $s['type'] ?? 'retail';
            $s['location'] = $s['location'] ?? $s['location_name'] ?? '';
        }

        json_response(['ok' => true, 'applications' => $sellers]);
    } catch (PDOException $e) {
        safe_error('Failed to load applications.');
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = read_json_input();
    require_fields($payload, ['id', 'status']);
    $status = safe_text($payload['status'], 40);
    if (!in_array($status, ['pending', 'approved', 'rejected', 'blocked'], true)) {
        json_response(['ok' => false, 'message' => 'Invalid application status.'], 422);
    }
    try {
        $pdo = tamu_pdo();
        if (!table_exists($pdo, 'businesses')) {
            json_response(['ok' => false, 'message' => 'Businesses table is not installed.'], 500);
        }
        $stmt = $pdo->prepare('UPDATE businesses SET status = ? WHERE id = ?');
        $stmt->execute([$status, int_value($payload['id'])]);
        if (table_exists($pdo, 'users')) {
            $user = $pdo->prepare(
                "UPDATE users u
                 JOIN businesses b ON b.user_id = u.id
                 SET u.status = ?
                 WHERE b.id = ?"
            );
            $user->execute([$status, int_value($payload['id'])]);
        }
        json_response(['ok' => true]);
    } catch (PDOException $e) {
        safe_error('Failed to update application.');
    }
}
