<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'products')) {
        json_response(['ok' => false, 'message' => 'Products table is not installed.'], 500);
    }

    if ($method === 'GET') {
        $businessId = trim_string($_GET['businessId'] ?? '');
        $categoryId = trim_string($_GET['categoryId'] ?? '');
        $where = [];
        $params = [];
        if ($businessId !== '') {
            $where[] = 'p.business_id = ?';
            $params[] = int_value($businessId);
        }
        if ($categoryId !== '') {
            $where[] = 'p.category_id = ?';
            $params[] = int_value($categoryId);
        }
        $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $stmt = $pdo->prepare(
            "SELECT p.*, c.name AS category_name, b.name AS business_name
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             LEFT JOIN businesses b ON b.id = p.business_id
             {$sqlWhere}
             ORDER BY p.created_at DESC"
        );
        $stmt->execute($params);
        json_response(['ok' => true, 'products' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        require __DIR__ . '/save.php';
    }

    if ($method === 'DELETE') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['id']);
        $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');
        $stmt->execute([int_value($payload['id'])]);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    safe_error('Products request failed.');
}
