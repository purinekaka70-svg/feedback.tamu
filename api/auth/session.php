<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');
$claims = current_auth_claims();
$role = strtolower((string) ($claims['role'] ?? ''));
if ($role === '') {
    json_response(['ok' => false, 'message' => 'No active session.'], 401);
}

json_response([
    'ok' => true,
    'session' => [
        'userId' => $claims['userId'] ?? null,
        'businessId' => $claims['businessId'] ?? null,
        'role' => $role,
        'status' => $claims['status'] ?? null,
    ],
]);
