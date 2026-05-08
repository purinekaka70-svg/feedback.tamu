<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

try {
    $pdo = tamu_pdo();
    $categories = $pdo->query(
        'SELECT id, name, created_at
         FROM categories
         ORDER BY name ASC'
    )->fetchAll();

    json_response([
        'ok' => true,
        'categories' => $categories,
    ]);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Failed to load categories.',
        'error' => $error->getMessage(),
    ], 500);
}
