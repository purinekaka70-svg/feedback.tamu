<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

const DEFAULT_CATEGORY_NAMES = ['Supermarket', 'Retail', 'Wholesale'];

try {
    $pdo = tamu_pdo();
    $categories = [];
    foreach (DEFAULT_CATEGORY_NAMES as $index => $name) {
        $categories[strtolower($name)] = [
            'id' => 'default-' . ($index + 1),
            'name' => $name,
            'created_at' => null,
            'default' => true,
        ];
    }

    if (table_exists($pdo, 'categories')) {
        foreach ($pdo->query(
            'SELECT id, name, created_at
             FROM categories
             ORDER BY name ASC'
        )->fetchAll() as $category) {
            $key = strtolower(trim((string) $category['name']));
            if ($key !== '') {
                $categories[$key] = $category;
            }
        }
    }

    json_response([
        'ok' => true,
        'categories' => array_values($categories),
    ]);
} catch (PDOException $error) {
    safe_error('Failed to load categories.');
}
