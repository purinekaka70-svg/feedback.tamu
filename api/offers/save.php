<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, [
    'storeId',
    'storeName',
    'offerTitle',
    'offerNote',
    'offerExpiry',
]);

$publicId = trim_string($payload['id'] ?? '');
if ($publicId === '') {
    $publicId = generate_public_id('offer');
}

try {
    $pdo = tamu_pdo();

    $insertOffer = $pdo->prepare(
        'INSERT INTO seller_offers
        (
            public_id,
            seller_public_id,
            store_name,
            offer_title,
            offer_note,
            offer_expiry,
            offer_image
        )
        VALUES
        (
            :public_id,
            :seller_public_id,
            :store_name,
            :offer_title,
            :offer_note,
            :offer_expiry,
            :offer_image
        )'
    );

    $insertOffer->execute([
        'public_id' => $publicId,
        'seller_public_id' => trim_string($payload['storeId']),
        'store_name' => trim_string($payload['storeName']),
        'offer_title' => trim_string($payload['offerTitle']),
        'offer_note' => trim_string($payload['offerNote']),
        'offer_expiry' => trim_string($payload['offerExpiry']),
        'offer_image' => trim_string($payload['offerImage'] ?? ''),
    ]);

    json_response([
        'ok' => true,
        'message' => 'Seller offer saved.',
        'offer' => [
            'id' => (int) $pdo->lastInsertId(),
            'publicId' => $publicId,
        ],
    ], 201);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Failed to save seller offer.',
        'error' => $error->getMessage(),
    ], 500);
}
