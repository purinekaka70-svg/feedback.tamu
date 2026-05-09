<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
const DEFAULT_CATEGORY_NAMES = ['Supermarket', 'Retail', 'Wholesale'];

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'categories')) {
        json_response(['ok' => false, 'message' => 'Categories table is not installed.'], 500);
    }

    if ($method === 'GET') {
        $businessId = trim_string($_GET['businessId'] ?? '');
        $where = '';
        $params = [];
        if ($businessId !== '') {
            $where = 'WHERE business_id = ? OR business_id IS NULL';
            $params[] = int_value($businessId);
        }
        $stmt = $pdo->prepare("SELECT id, business_id, name, image, created_at FROM categories {$where} ORDER BY name ASC");
        $stmt->execute($params);
        $categories = [];
        foreach (DEFAULT_CATEGORY_NAMES as $index => $name) {
            $categories[strtolower($name)] = [
                'id' => 'default-' . ($index + 1),
                'business_id' => null,
                'businessId' => '',
                'name' => $name,
                'image' => '',
                'created_at' => null,
                'default' => true,
            ];
        }
        foreach ($stmt->fetchAll() as $category) {
            $key = strtolower(trim((string) $category['name']));
            if ($key !== '') {
                $categories[$key] = $category;
            }
        }
        json_response(['ok' => true, 'categories' => array_values($categories)]);
    }

    if ($method === 'POST') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['name']);
        $businessId = trim_string($payload['businessId'] ?? '') !== '' ? int_value($payload['businessId']) : null;
        $id = trim_string($payload['id'] ?? '');
        if ($id !== '' && is_numeric($id)) {
            $stmt = $pdo->prepare(
                'UPDATE categories SET business_id = ?, name = ?, image = ? WHERE id = ?'
            );
            $stmt->execute([$businessId, safe_text($payload['name'], 100), validate_base64_image($payload['image'] ?? '', 153600), (int) $id]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO categories (business_id, name, image)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE image = VALUES(image)'
            );
            $stmt->execute([$businessId, safe_text($payload['name'], 100), validate_base64_image($payload['image'] ?? '', 153600)]);
            $id = (string) $pdo->lastInsertId();
        }
        json_response(['ok' => true, 'category' => ['id' => $id]], 201);
    }

    if ($method === 'DELETE') {
        require_auth_roles(['admin', 'seller']);
        $payload = read_json_input();
        require_fields($payload, ['id']);
        $stmt = $pdo->prepare('DELETE FROM categories WHERE id = ?');
        $stmt->execute([int_value($payload['id'])]);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    safe_error('Categories request failed.');
}
