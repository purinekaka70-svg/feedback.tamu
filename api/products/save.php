<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
$payload = read_json_input();
require_fields($payload, ['businessId', 'name', 'categoryId', 'price']);

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'products')) {
        json_response(['ok' => false, 'message' => 'Products table is not installed.'], 500);
    }

    $businessId = int_value($payload['businessId']);
    $categoryId = trim_string($payload['categoryId']);

    if (!is_numeric($categoryId)) {
        $insertCategory = $pdo->prepare(
            'INSERT INTO categories (business_id, name, image)
             VALUES (?, ?, "")
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $insertCategory->execute([$businessId, $categoryId]);
        $newCategoryId = (int) $pdo->lastInsertId();
        if ($newCategoryId > 0) {
            $categoryId = (string) $newCategoryId;
        } else {
            $findCategory = $pdo->prepare('SELECT id FROM categories WHERE business_id = ? AND name = ? LIMIT 1');
            $findCategory->execute([$businessId, trim_string($payload['categoryId'])]);
            $categoryId = (string) $findCategory->fetchColumn();
        }
    }

    $productId = trim_string($payload['id'] ?? '');
    $params = [
        'business_id' => $businessId,
        'category_id' => int_value($categoryId),
        'name' => trim_string($payload['name']),
        'image' => trim_string($payload['image'] ?? ''),
        'price' => float_value($payload['price']),
        'offer_flag' => !empty($payload['offerFlag']) ? 1 : 0,
        'stock' => int_value($payload['stock'] ?? 0),
        'description' => trim_string($payload['description'] ?? ''),
    ];

    if ($productId !== '' && is_numeric($productId)) {
        $params['id'] = (int) $productId;
        $stmt = $pdo->prepare(
            'UPDATE products
             SET business_id = :business_id,
                 category_id = :category_id,
                 name = :name,
                 image = :image,
                 price = :price,
                 offer_flag = :offer_flag,
                 stock = :stock,
                 description = :description
             WHERE id = :id'
        );
        $stmt->execute($params);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO products (business_id, category_id, name, image, price, offer_flag, stock, description)
             VALUES (:business_id, :category_id, :name, :image, :price, :offer_flag, :stock, :description)'
        );
        $stmt->execute($params);
        $productId = (string) $pdo->lastInsertId();
    }

    json_response(['ok' => true, 'product' => ['id' => $productId]], 201);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Failed to save product.', 'error' => $error->getMessage()], 500);
}
