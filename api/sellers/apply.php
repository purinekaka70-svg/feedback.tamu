<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');

$payload = read_json_input();
require_fields($payload, [
    'storeName',
    'businessType',
    'ownerName',
    'phone',
    'location',
    'categoryFocus',
    'minimumOrder',
    'prepTime',
    'latitude',
    'longitude',
]);

$paymentOptions = string_array($payload['paymentOptions'] ?? []);
if (!$paymentOptions) {
    json_response([
        'ok' => false,
        'message' => 'At least one payment option is required.',
    ], 422);
}

$publicId = trim_string($payload['id'] ?? '');
if ($publicId === '') {
    $publicId = generate_public_id('seller');
}

try {
    $pdo = tamu_pdo();
    $pdo->beginTransaction();

    $insertApplication = $pdo->prepare(
        'INSERT INTO seller_applications
        (
            public_id,
            store_name,
            business_type,
            owner_name,
            phone,
            location_name,
            latitude,
            longitude,
            category_focus,
            minimum_order,
            prep_time,
            status
        )
        VALUES
        (
            :public_id,
            :store_name,
            :business_type,
            :owner_name,
            :phone,
            :location_name,
            :latitude,
            :longitude,
            :category_focus,
            :minimum_order,
            :prep_time,
            :status
        )'
    );

    $insertApplication->execute([
        'public_id' => $publicId,
        'store_name' => trim_string($payload['storeName']),
        'business_type' => trim_string($payload['businessType']),
        'owner_name' => trim_string($payload['ownerName']),
        'phone' => trim_string($payload['phone']),
        'location_name' => trim_string($payload['location']),
        'latitude' => float_value($payload['latitude']),
        'longitude' => float_value($payload['longitude']),
        'category_focus' => trim_string($payload['categoryFocus']),
        'minimum_order' => float_value($payload['minimumOrder']),
        'prep_time' => trim_string($payload['prepTime']),
        'status' => trim_string($payload['status'] ?? 'pending'),
    ]);

    $applicationId = (int) $pdo->lastInsertId();

    $insertPaymentMethod = $pdo->prepare(
        'INSERT INTO seller_application_payment_methods (application_id, payment_method)
         VALUES (:application_id, :payment_method)'
    );

    foreach ($paymentOptions as $method) {
        $insertPaymentMethod->execute([
            'application_id' => $applicationId,
            'payment_method' => $method,
        ]);
    }

    $pdo->commit();

    json_response([
        'ok' => true,
        'message' => 'Seller application saved.',
        'application' => [
            'id' => $applicationId,
            'publicId' => $publicId,
            'status' => trim_string($payload['status'] ?? 'pending'),
        ],
    ], 201);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    json_response([
        'ok' => false,
        'message' => 'Failed to save seller application.',
        'error' => $error->getMessage(),
    ], 500);
}
