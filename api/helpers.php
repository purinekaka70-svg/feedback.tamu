<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function is_production(): bool
{
    return strtolower((string) (getenv('TAMU_ENV') ?: 'production')) === 'production';
}

function secure_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    @session_start();
}

function secure_cookie_flag(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function auth_secret(): string
{
    $secret = (string) (getenv('TAMU_APP_KEY') ?: '');
    if ($secret === '') {
        $config = require __DIR__ . '/config.php';
        $secret = hash('sha256', ($config['db_name'] ?? '') . '|' . ($config['db_user'] ?? '') . '|' . __DIR__);
    }
    return $secret;
}

function issue_auth_cookie(array $claims): void
{
    $claims['iat'] = time();
    $claims['exp'] = time() + 60 * 60 * 8;
    $payload = base64_encode(json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $signature = hash_hmac('sha256', $payload, auth_secret());
    setcookie('TAMU_AUTH', $payload . '.' . $signature, [
        'expires' => $claims['exp'],
        'path' => '/',
        'domain' => '',
        'secure' => secure_cookie_flag(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_cookie_claims(): array
{
    $token = (string) ($_COOKIE['TAMU_AUTH'] ?? '');
    if ($token === '' || strpos($token, '.') === false) {
        return [];
    }

    [$payload, $signature] = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $payload, auth_secret());
    if (!hash_equals($expected, $signature)) {
        return [];
    }

    $claims = json_decode((string) base64_decode($payload, true), true);
    if (!is_array($claims) || (int) ($claims['exp'] ?? 0) < time()) {
        return [];
    }

    return $claims;
}

function current_user_role(): string
{
    secure_session_start();
    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    if ($role !== '') {
        return $role;
    }

    $claims = auth_cookie_claims();
    return strtolower((string) ($claims['role'] ?? ''));
}

function current_auth_claims(): array
{
    secure_session_start();
    $claims = auth_cookie_claims();
    if ($claims) {
        return normalize_auth_claims($claims);
    }

    if (!empty($_SESSION['role'])) {
        return normalize_auth_claims([
            'userId' => $_SESSION['user_id'] ?? null,
            'businessId' => $_SESSION['business_id'] ?? null,
            'role' => $_SESSION['role'],
        ]);
    }

    return [];
}

function normalize_auth_claims(array $claims): array
{
    $role = strtolower((string) ($claims['role'] ?? ''));
    if ($role !== 'seller') {
        return $claims;
    }

    $businessId = int_value($claims['businessId'] ?? 0);
    if ($businessId <= 0) {
        return [];
    }

    try {
        $pdo = tamu_pdo();
        if (!table_exists($pdo, 'businesses')) {
            return [];
        }

        $stmt = $pdo->prepare('SELECT id, user_id, status FROM businesses WHERE id = ? LIMIT 1');
        $stmt->execute([$businessId]);
        $business = $stmt->fetch();
        if (!$business || strtolower((string) ($business['status'] ?? '')) !== 'approved') {
            return [];
        }

        $claims['businessId'] = (int) $business['id'];
        $claims['userId'] = $claims['userId'] ?? ($business['user_id'] ?? null);
        $claims['role'] = 'seller';
        $claims['status'] = 'approved';
        return $claims;
    } catch (PDOException $error) {
        return [];
    }
}

function require_auth_roles(array $roles): void
{
    secure_session_start();
    $claims = current_auth_claims();
    $role = strtolower((string) ($claims['role'] ?? ''));
    $allowed = array_map(static function ($item): string {
        return strtolower((string) $item);
    }, $roles);

    if ($role === '' || !in_array($role, $allowed, true)) {
        json_response(['ok' => false, 'message' => 'Unauthorized request.'], 401);
    }
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: SAMEORIGIN');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_method(string $method): void
{
    $requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (strtoupper($requestMethod) !== strtoupper($method)) {
        json_response([
            'ok' => false,
            'message' => 'Method not allowed.',
        ], 405);
    }
}

function read_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    if (strlen($raw) > 1024 * 1024 * 3) {
        json_response([
            'ok' => false,
            'message' => 'Payload is too large.',
        ], 413);
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response([
            'ok' => false,
            'message' => 'Invalid JSON payload.',
        ], 400);
    }

    return $decoded;
}

function trim_string($value): string
{
    return trim((string) ($value ?? ''));
}

function safe_text($value, int $maxLength = 255): string
{
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim_string($value));
    if ($text === null) {
        $text = trim_string($value);
    }

    return substr($text, 0, $maxLength);
}

function safe_email($value): string
{
    return strtolower(safe_text($value, 180));
}

function require_valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['ok' => false, 'message' => 'Enter a valid email address.'], 422);
    }
}

function validate_base64_image(?string $image, int $maxBytes = 1048576): string
{
    $image = trim_string($image);
    if ($image === '') {
        return '';
    }

    if (!preg_match('/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+\/=]+)$/', $image, $matches)) {
        json_response(['ok' => false, 'message' => 'Only PNG, JPG, WEBP, or GIF images are allowed.'], 422);
    }

    $binary = base64_decode($matches[2], true);
    if ($binary === false || strlen($binary) > $maxBytes) {
        json_response(['ok' => false, 'message' => 'Image is invalid or too large.'], 422);
    }

    return $image;
}

function validate_image_reference(?string $image, int $maxBytes = 1048576): string
{
    $image = trim_string($image);
    if ($image === '') {
        return '';
    }

    if (preg_match('/^data:image\//', $image)) {
        return validate_base64_image($image, $maxBytes);
    }

    if (filter_var($image, FILTER_VALIDATE_URL)
        && preg_match('/^https?:\/\//i', $image)
        && strlen($image) <= 2048) {
        return $image;
    }

    json_response(['ok' => false, 'message' => 'Use a valid image URL or PNG/JPG/WEBP/GIF upload.'], 422);
}

function safe_error(string $message, int $status = 500): void
{
    json_response(['ok' => false, 'message' => $message], $status);
}

function float_value($value): float
{
    return is_numeric($value) ? (float) $value : 0.0;
}

function int_value($value): int
{
    return is_numeric($value) ? (int) $value : 0;
}

function string_array($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $cleaned = [];
    foreach ($value as $entry) {
        $text = trim_string($entry);
        if ($text !== '') {
            $cleaned[] = $text;
        }
    }

    return array_values(array_unique($cleaned));
}

function require_fields(array $payload, array $fields): void
{
    $missing = [];

    foreach ($fields as $field) {
        if (trim_string($payload[$field] ?? '') === '') {
            $missing[] = $field;
        }
    }

    if ($missing) {
        json_response([
            'ok' => false,
            'message' => 'Missing required fields.',
            'missing' => $missing,
        ], 422);
    }
}

function generate_public_id(string $prefix): string
{
    try {
        return $prefix . '-' . bin2hex(random_bytes(6));
    } catch (Exception $error) {
        return $prefix . '-' . uniqid();
    }
}

function table_exists(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*)
             FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $stmt->execute([$table]);
        return (int) $stmt->fetchColumn() > 0;
    } catch (PDOException $error) {
        return false;
    }
}

function column_exists(PDO $pdo, string $table, string $column): bool
{
    try {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
        );
        $stmt->execute([$table, $column]);
        return (int) $stmt->fetchColumn() > 0;
    } catch (PDOException $error) {
        return false;
    }
}
