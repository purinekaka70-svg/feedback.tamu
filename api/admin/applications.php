<?php
declare(strict_types=1);
require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $status = $_GET['status'] ?? null;
    try {
        $pdo = tamu_pdo();
        $sql = 'SELECT * FROM sellers';
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
        $stmt = $pdo->prepare('UPDATE sellers SET status = ? WHERE id = ?');
        $stmt->execute([$payload['status'], $payload['id']]);
        json_response(['ok' => true]);
    } catch (PDOException $e) {
        json_response(['ok' => false, 'message' => $e->getMessage()], 500);
    }
}