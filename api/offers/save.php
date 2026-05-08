<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
require_auth_roles(['admin', 'seller']);

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

    if (!table_exists($pdo, 'seller_offers')) {
        json_response(['ok' => false, 'message' => 'Seller offers table is not installed.'], 500);
    }

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
        )
        ON DUPLICATE KEY UPDATE
            seller_public_id = VALUES(seller_public_id),
            store_name = VALUES(store_name),
            offer_title = VALUES(offer_title),
            offer_note = VALUES(offer_note),
            offer_expiry = VALUES(offer_expiry),
            offer_image = VALUES(offer_image)'
    );

    $insertOffer->execute([
        'public_id' => $publicId,
        'seller_public_id' => safe_text($payload['storeId'], 120),
        'store_name' => safe_text($payload['storeName'], 150),
        'offer_title' => safe_text($payload['offerTitle'], 150),
        'offer_note' => safe_text($payload['offerNote'], 500),
        'offer_expiry' => safe_text($payload['offerExpiry'], 40),
        'offer_image' => validate_base64_image($payload['offerImage'] ?? '', 1048576),
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
    safe_error('Failed to save seller offer.');
}
