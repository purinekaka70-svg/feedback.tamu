<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $status = $_GET['status'] ?? null;
    try {
        $pdo = tamu_pdo();
        if (!table_exists($pdo, 'businesses')) {
            json_response(['ok' => false, 'message' => 'Businesses table is not installed.'], 500);
        }
        $sql = 'SELECT * FROM businesses';
        $params = [];
        if ($status) {
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
        json_response(['ok' => false, 'message' => $e->getMessage()], 500);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = read_json_input();
    require_fields($payload, ['id', 'status']);
    try {
        $pdo = tamu_pdo();
        if (!table_exists($pdo, 'businesses')) {
            json_response(['ok' => false, 'message' => 'Businesses table is not installed.'], 500);
        }
        $stmt = $pdo->prepare('UPDATE businesses SET status = ? WHERE id = ?');
        $stmt->execute([$payload['status'], $payload['id']]);
        if (table_exists($pdo, 'users')) {
            $user = $pdo->prepare(
                "UPDATE users u
                 JOIN businesses b ON b.user_id = u.id
                 SET u.status = ?
                 WHERE b.id = ?"
            );
            $user->execute([$payload['status'], $payload['id']]);
        }
        json_response(['ok' => true]);
    } catch (PDOException $e) {
        json_response(['ok' => false, 'message' => $e->getMessage()], 500);
    }
}
