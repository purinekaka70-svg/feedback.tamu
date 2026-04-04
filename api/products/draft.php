<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, [
    'storeId',
    'storeName',
    'productName',
    'productCategory',
    'productPrice',
    'productStock',
]);

$publicId = trim_string($payload['id'] ?? '');
if ($publicId === '') {
    $publicId = generate_public_id('draft');
}

try {
    $pdo = tamu_pdo();

    $applicationId = null;
    $lookup = $pdo->prepare(
        'SELECT id
         FROM seller_applications
         WHERE public_id = :public_id
         LIMIT 1'
    );
    $lookup->execute([
        'public_id' => trim_string($payload['storeId']),
    ]);
    $application = $lookup->fetch();
    if ($application) {
        $applicationId = (int) $application['id'];
    }

    $insertDraft = $pdo->prepare(
        'INSERT INTO product_drafts
        (
            public_id,
            seller_application_id,
            seller_public_id,
            store_name,
            product_name,
            product_category,
            product_price,
            product_stock,
            product_deal
        )
        VALUES
        (
            :public_id,
            :seller_application_id,
            :seller_public_id,
            :store_name,
            :product_name,
            :product_category,
            :product_price,
            :product_stock,
            :product_deal
        )'
    );

    $insertDraft->bindValue('public_id', $publicId);
    $insertDraft->bindValue('seller_application_id', $applicationId, $applicationId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $insertDraft->bindValue('seller_public_id', trim_string($payload['storeId']));
    $insertDraft->bindValue('store_name', trim_string($payload['storeName']));
    $insertDraft->bindValue('product_name', trim_string($payload['productName']));
    $insertDraft->bindValue('product_category', trim_string($payload['productCategory']));
    $insertDraft->bindValue('product_price', float_value($payload['productPrice']));
    $insertDraft->bindValue('product_stock', trim_string($payload['productStock']));
    $insertDraft->bindValue('product_deal', trim_string($payload['productDeal'] ?? ''), PDO::PARAM_STR);
    $insertDraft->execute();

    json_response([
        'ok' => true,
        'message' => 'Product draft saved.',
        'draft' => [
            'id' => (int) $pdo->lastInsertId(),
            'publicId' => $publicId,
        ],
    ], 201);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Failed to save product draft.',
        'error' => $error->getMessage(),
    ], 500);
}
