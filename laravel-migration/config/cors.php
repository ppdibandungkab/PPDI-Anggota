<?php

$rawOrigins = array_values(array_filter(array_map(
    fn ($o) => rtrim(trim($o), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', '*'))
)));

if (empty($rawOrigins)) {
    $rawOrigins = ['*'];
}

$requestedCredentials = filter_var(env('CORS_SUPPORTS_CREDENTIALS', false), FILTER_VALIDATE_BOOLEAN);
// Browser melarang kombinasi Access-Control-Allow-Origin: * dengan Access-Control-Allow-Credentials: true
$supportsCredentials = $requestedCredentials && !in_array('*', $rawOrigins, true);

return [
    'paths' => ['api/*', 'uploads/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $rawOrigins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => [
        'Origin',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Requested-With',
        'X-XSRF-TOKEN',
        'x-user-id',
        'x-user-role',
        'user-role',
        'x-user-name',
    ],
    'exposed_headers' => ['Content-Disposition'],
    'max_age' => 3600,
    'supports_credentials' => $supportsCredentials,
];
