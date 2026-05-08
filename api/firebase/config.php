<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('GET');

$config = [
    'apiKey' => getenv('TAMU_FIREBASE_API_KEY') ?: '',
    'authDomain' => getenv('TAMU_FIREBASE_AUTH_DOMAIN') ?: '',
    'projectId' => getenv('TAMU_FIREBASE_PROJECT_ID') ?: '',
    'storageBucket' => getenv('TAMU_FIREBASE_STORAGE_BUCKET') ?: '',
    'messagingSenderId' => getenv('TAMU_FIREBASE_MESSAGING_SENDER_ID') ?: '',
    'appId' => getenv('TAMU_FIREBASE_APP_ID') ?: '',
];

$missing = array_keys(array_filter($config, static function ($value): bool {
    return trim((string) $value) === '';
}));

if ($missing) {
    json_response([
        'ok' => false,
        'message' => 'Firebase web config is not set on this server.',
        'missing' => $missing,
    ], 503);
}

json_response([
    'ok' => true,
    'config' => $config,
]);
