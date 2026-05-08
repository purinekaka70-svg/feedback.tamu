<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/helpers.php';

$email = getenv('TAMU_ADMIN_EMAIL') ?: 'AdminTamuEpress@gmail.com';
$password = getenv('TAMU_ADMIN_PASSWORD') ?: '';

if ($password === '') {
    fwrite(STDERR, "Set TAMU_ADMIN_PASSWORD before running this seed.\n");
    exit(1);
}

$pdo = tamu_pdo();
$hash = password_hash($password, PASSWORD_DEFAULT);

try {
    $user = $pdo->prepare(
        "INSERT INTO users (name, email, password, role, status)
         VALUES (?, ?, ?, 'admin', 'approved')
         ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            password = VALUES(password),
            role = 'admin',
            status = 'approved'"
    );
    $user->execute(['Admin', $email, $hash]);
    echo "Admin account seeded for {$email}\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
