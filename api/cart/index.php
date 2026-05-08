<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function cart_session_id(): string
{
    return trim_string($_GET['sessionId'] ?? '') ?: trim_string(read_json_input()['sessionId'] ?? '');
}

try {
    $pdo = tamu_pdo();
    if (!table_exists($pdo, 'cart')) {
        json_response(['ok' => false, 'message' => 'Cart table is not installed.'], 500);
    }

    if ($method === 'GET') {
        $sessionId = trim_string($_GET['sessionId'] ?? '');
        if ($sessionId === '') {
            json_response(['ok' => false, 'message' => 'sessionId is required.'], 422);
        }
        $stmt = $pdo->prepare(
            'SELECT c.*, p.name, p.price, p.image, p.category_id, b.name AS business_name
             FROM cart c
             JOIN products p ON p.id = c.product_id
             LEFT JOIN businesses b ON b.id = c.business_id
             WHERE c.session_id = ?
             ORDER BY c.updated_at DESC'
        );
        $stmt->execute([$sessionId]);
        json_response(['ok' => true, 'items' => $stmt->fetchAll()]);
    }

    $payload = read_json_input();
    $sessionId = trim_string($payload['sessionId'] ?? '');
    if ($sessionId === '') {
        json_response(['ok' => false, 'message' => 'sessionId is required.'], 422);
    }

    if ($method === 'POST') {
        require_fields($payload, ['productId', 'businessId']);
        $stmt = $pdo->prepare(
            'INSERT INTO cart (user_id, session_id, product_id, business_id, quantity)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                quantity = VALUES(quantity),
                business_id = VALUES(business_id)'
        );
        $stmt->execute([
            trim_string($payload['userId'] ?? '') ?: null,
            $sessionId,
            trim_string($payload['productId']),
            trim_string($payload['businessId']),
            max(1, int_value($payload['quantity'] ?? 1)),
        ]);
        json_response(['ok' => true], 201);
    }

    if ($method === 'DELETE') {
        $productId = trim_string($payload['productId'] ?? '');
        if ($productId !== '') {
            $stmt = $pdo->prepare('DELETE FROM cart WHERE session_id = ? AND product_id = ?');
            $stmt->execute([$sessionId, $productId]);
        } else {
            $stmt = $pdo->prepare('DELETE FROM cart WHERE session_id = ?');
            $stmt->execute([$sessionId]);
        }
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
} catch (PDOException $error) {
    json_response(['ok' => false, 'message' => 'Cart request failed.', 'error' => $error->getMessage()], 500);
}
