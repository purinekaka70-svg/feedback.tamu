<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

function slug_id(string $value): string
{
    $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $value), '-'));
    return $slug !== '' ? $slug : 'item';
}

try {
    $pdo = tamu_pdo();

    $businesses = [];
    if (table_exists($pdo, 'businesses')) {
        $rows = $pdo->query(
            "SELECT id, user_id, name, owner_name, phone, email, type, location_name, latitude, longitude,
                    payment_methods, till_number, pochi_number, bank_account, delivery_availability,
                    delivery_notes, logo, logo_image, rating, status, created_at
             FROM businesses
             WHERE status = 'approved'
             ORDER BY name ASC"
        )->fetchAll();

        foreach ($rows as $row) {
            $location = trim_string($row['location_name'] ?? 'Location pending');
            $logo = $row['logo_image'] ?? $row['logo'] ?? '';
            $businesses[] = [
                'id' => (string) $row['id'],
                'userId' => $row['user_id'] ?? '',
                'locationId' => slug_id($location),
                'name' => $row['name'],
                'storeName' => $row['name'],
                'type' => $row['type'] ?: 'retail',
                'businessType' => $row['type'] ?: 'retail',
                'logo' => $logo,
                'logoImage' => $logo,
                'rating' => (float) ($row['rating'] ?? 4.5),
                'ownerName' => $row['owner_name'] ?? '',
                'phone' => $row['phone'] ?? '',
                'email' => $row['email'] ?? '',
                'location' => $location,
                'county' => $location,
                'latitude' => (float) ($row['latitude'] ?? 0),
                'longitude' => (float) ($row['longitude'] ?? 0),
                'paymentOptions' => json_decode($row['payment_methods'] ?? '[]', true) ?: [],
                'tillNumber' => $row['till_number'] ?? '',
                'pochiNumber' => $row['pochi_number'] ?? '',
                'bankAccount' => $row['bank_account'] ?? '',
                'deliveryAvailability' => $row['delivery_availability'] ?? '',
                'deliveryNotes' => $row['delivery_notes'] ?? '',
                'status' => 'approved',
                'createdAt' => $row['created_at'] ?? '',
            ];
        }
    }

    $businessById = [];
    foreach ($businesses as $business) {
        $businessById[(string) $business['id']] = $business;
    }

    $products = [];
    if (table_exists($pdo, 'products')) {
        $rows = $pdo->query(
            "SELECT p.id, p.business_id, p.category_id, p.name, p.image, p.price, p.offer_flag, p.stock, p.description, p.created_at,
                    c.name AS category_name
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             ORDER BY p.created_at DESC"
        )->fetchAll();
        foreach ($rows as $row) {
            $business = $businessById[(string) $row['business_id']] ?? null;
            if (!$business) {
                continue;
            }
            $categoryName = (string) ($row['category_name'] ?? $row['category_id'] ?? 'Other');
            $products[] = [
                'id' => (string) $row['id'],
                'businessId' => (string) $row['business_id'],
                'sellerId' => (string) $row['business_id'],
                'storeId' => (string) $row['business_id'],
                'businessName' => $business['storeName'],
                'sellerName' => $business['storeName'],
                'storeName' => $business['storeName'],
                'categoryId' => (string) ($row['category_id'] ?: slug_id($categoryName)),
                'categoryName' => $categoryName,
                'productCategory' => $categoryName,
                'name' => $row['name'],
                'productName' => $row['name'],
                'image' => $row['image'] ?? '',
                'productImage' => $row['image'] ?? '',
                'price' => (float) $row['price'],
                'productPrice' => (float) $row['price'],
                'stock' => $row['stock'] ?? 'In stock',
                'productStock' => $row['stock'] ?? 'In stock',
                'offerFlag' => (bool) $row['offer_flag'],
                'productOffer' => (bool) $row['offer_flag'] ? 'Offer' : '',
                'description' => $row['description'] ?? '',
                'createdAt' => $row['created_at'] ?? '',
            ];
        }
    }

    $categoryMap = [];
    if (table_exists($pdo, 'categories')) {
        $categoryImageColumn = column_exists($pdo, 'categories', 'image') ? ', image' : '';
        foreach ($pdo->query("SELECT id, name{$categoryImageColumn} FROM categories ORDER BY name ASC")->fetchAll() as $row) {
            $categoryMap[(string) $row['name']] = [
                'id' => (string) ($row['id'] ?? slug_id($row['name'])),
                'name' => $row['name'],
                'image' => $row['image'] ?? '',
            ];
        }
    }
    foreach ($products as $product) {
        $name = $product['productCategory'];
        if (!isset($categoryMap[$name])) {
            $categoryMap[$name] = [
                'id' => $product['categoryId'],
                'businessId' => $product['businessId'],
                'name' => $name,
                'image' => $product['productImage'],
            ];
        }
    }

    $locations = [];
    foreach ($businesses as $business) {
        $id = $business['locationId'];
        if (!isset($locations[$id])) {
            $locations[$id] = [
                'id' => $id,
                'name' => $business['location'],
                'image' => $business['logoImage'],
                'description' => 'Live marketplace location',
                'businessCount' => 0,
            ];
        }
        $locations[$id]['businessCount']++;
    }

    $offers = [];
    foreach ($products as $product) {
        if (!(bool) $product['offerFlag']) {
            continue;
        }
        $offers[] = [
            'id' => 'product-offer-' . $product['id'],
            'storeId' => $product['storeId'],
            'sellerId' => $product['storeId'],
            'businessId' => $product['storeId'],
            'storeName' => $product['storeName'],
            'title' => $product['productName'],
            'offerTitle' => $product['productName'],
            'note' => $product['productOffer'],
            'offerNote' => $product['productOffer'],
            'expires' => 'Store offer',
            'offerExpiry' => 'Store offer',
            'image' => $product['productImage'],
            'offerImage' => $product['productImage'],
            'productId' => $product['id'],
        ];
    }

    if (table_exists($pdo, 'seller_offers')) {
        $offerRows = $pdo->query(
            "SELECT public_id, seller_public_id, store_name, offer_title, offer_note, offer_expiry, offer_image, created_at
             FROM seller_offers
             ORDER BY created_at DESC"
        )->fetchAll();

        foreach ($offerRows as $row) {
            $business = $businessById[(string) $row['seller_public_id']] ?? null;
            if (!$business) {
                continue;
            }
            $offers[] = [
                'id' => $row['public_id'],
                'storeId' => $row['seller_public_id'],
                'sellerId' => $row['seller_public_id'],
                'businessId' => $row['seller_public_id'],
                'storeName' => $row['store_name'] ?: $business['storeName'],
                'title' => $row['offer_title'],
                'offerTitle' => $row['offer_title'],
                'note' => $row['offer_note'],
                'offerNote' => $row['offer_note'],
                'expires' => $row['offer_expiry'],
                'offerExpiry' => $row['offer_expiry'],
                'image' => $row['offer_image'] ?? '',
                'offerImage' => $row['offer_image'] ?? '',
                'createdAt' => $row['created_at'] ?? '',
            ];
        }
    }

    json_response([
        'ok' => true,
        'locations' => array_values($locations),
        'businesses' => $businesses,
        'categories' => array_values($categoryMap),
        'products' => $products,
        'offers' => $offers,
    ]);
} catch (PDOException $error) {
    json_response([
        'ok' => false,
        'message' => 'Failed to load live marketplace data.',
        'error' => $error->getMessage(),
    ], 500);
}
