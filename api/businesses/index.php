<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'businesses')) {
        json_response(['ok' => false, 'message' => 'Businesses table is not installed.'], 500);
    }

    if ($method === 'GET') {
        $status = trim_string($_GET['status'] ?? '');
        $sql = 'SELECT * FROM businesses';
        $params = [];
        if ($status !== '') {
            $sql .= ' WHERE status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['paymentOptions'] = json_decode($row['payment_methods'] ?? '[]', true) ?: [];
        }
        json_response(['ok' => true, 'businesses' => $rows]);
    }

    if ($method === 'POST') {
        $payload = read_json_input();
        require_fields($payload, ['name', 'email']);
        $stmt = $pdo->prepare(
            'INSERT INTO businesses
             (user_id, location_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
              payment_methods, till_number, pochi_number, bank_account, delivery_availability, delivery_notes, logo, logo_image, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                location_id = VALUES(location_id),
                name = VALUES(name),
                owner_name = VALUES(owner_name),
                phone = VALUES(phone),
                type = VALUES(type),
                location_name = VALUES(location_name),
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                payment_methods = VALUES(payment_methods),
                till_number = VALUES(till_number),
                pochi_number = VALUES(pochi_number),
                bank_account = VALUES(bank_account),
                delivery_availability = VALUES(delivery_availability),
                delivery_notes = VALUES(delivery_notes),
                logo = VALUES(logo),
                logo_image = VALUES(logo_image),
                status = VALUES(status)'
        );
        $logo = trim_string($payload['logoImage'] ?? $payload['logo'] ?? $payload['image'] ?? '');
        $stmt->execute([
            trim_string($payload['userId'] ?? '') !== '' ? int_value($payload['userId']) : null,
            trim_string($payload['locationId'] ?? '') !== '' ? int_value($payload['locationId']) : null,
            trim_string($payload['name']),
            trim_string($payload['ownerName'] ?? ''),
            trim_string($payload['phone'] ?? ''),
            trim_string($payload['email']),
            trim_string($payload['type'] ?? 'retail'),
            trim_string($payload['locationName'] ?? $payload['location'] ?? ''),
            float_value($payload['latitude'] ?? 0),
            float_value($payload['longitude'] ?? 0),
            json_encode(string_array($payload['paymentMethods'] ?? []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            trim_string($payload['tillNumber'] ?? ''),
            trim_string($payload['pochiNumber'] ?? ''),
            trim_string($payload['bankAccount'] ?? ''),
            trim_string($payload['deliveryAvailability'] ?? ''),
            trim_string($payload['deliveryNotes'] ?? ''),
            $logo,
            $logo,
            trim_string($payload['status'] ?? 'pending'),
        ]);
        $id = trim_string($payload['id'] ?? '') ?: (string) $pdo->lastInsertId();
        json_response(['ok' => true, 'business' => ['id' => $id]], 201);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Businesses request failed.', 'error' => $error->getMessage()], 500);
}
