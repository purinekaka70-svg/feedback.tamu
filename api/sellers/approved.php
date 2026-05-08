<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

try {
    $pdo = tamu_pdo();
    $applications = $pdo->query(
        "SELECT
            id,
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
            status,
            created_at
        FROM seller_applications
        WHERE status = 'approved'
        ORDER BY created_at DESC"
    )->fetchAll();

    if (!$applications) {
        json_response([
            'ok' => true,
            'sellers' => [],
        ]);
    }

    $applicationIds = array_map(static function (array $row): int {
        return (int) $row['id'];
    }, $applications);

    $placeholders = implode(',', array_fill(0, count($applicationIds), '?'));
    $paymentRows = $pdo->prepare(
        "SELECT application_id, payment_method
         FROM seller_application_payment_methods
         WHERE application_id IN ($placeholders)
         ORDER BY payment_method ASC"
    );
    $paymentRows->execute($applicationIds);

    $paymentLookup = [];
    foreach ($paymentRows->fetchAll() as $paymentRow) {
        $applicationId = (int) $paymentRow['application_id'];
        $paymentLookup[$applicationId][] = $paymentRow['payment_method'];
    }

    $sellers = array_map(static function (array $row) use ($paymentLookup): array {
        $applicationId = (int) $row['id'];
        return [
            'id' => $applicationId,
            'publicId' => $row['public_id'],
            'storeName' => $row['store_name'],
            'businessType' => $row['business_type'],
            'ownerName' => $row['owner_name'],
            'phone' => $row['phone'],
            'location' => $row['location_name'],
            'latitude' => (float) $row['latitude'],
            'longitude' => (float) $row['longitude'],
            'categoryFocus' => $row['category_focus'],
            'minimumOrder' => (float) $row['minimum_order'],
            'prepTime' => $row['prep_time'],
            'paymentOptions' => $paymentLookup[$applicationId] ?? [],
            'createdAt' => $row['created_at'],
        ];
    }, $applications);

    json_response([
        'ok' => true,
        'sellers' => $sellers,
    ]);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Failed to load approved sellers.',
        'error' => $error->getMessage(),
    ], 500);
}
