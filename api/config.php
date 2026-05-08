<?php
declare(strict_types=1);

return [
    'db_host' => getenv('TAMU_DB_HOST') ?: '127.0.0.1',
    'db_port' => getenv('TAMU_DB_PORT') ?: '3306',
    'db_name' => getenv('TAMU_DB_NAME') ?: 'tamu_express_market',
    'db_user' => getenv('TAMU_DB_USER') ?: 'root',
    'db_pass' => getenv('TAMU_DB_PASS') ?: '',
];
