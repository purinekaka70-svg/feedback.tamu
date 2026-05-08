<?php
declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';

ensure_method('POST');
secure_session_start();
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
}

setcookie('TAMU_AUTH', '', [
    'expires' => time() - 42000,
    'path' => '/',
    'domain' => '',
    'secure' => secure_cookie_flag(),
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_destroy();
json_response(['ok' => true]);
