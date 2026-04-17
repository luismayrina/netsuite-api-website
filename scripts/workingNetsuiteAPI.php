<?php
// --- 0. MANUAL .ENV LOADER ---
function loadEnv($path) {
    if (!file_exists($path)) {
        die("❌ .env file not found");
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') === false) continue;

        list($name, $value) = explode('=', $line, 2);

        $_ENV[trim($name)] = trim($value);
    }
}

loadEnv(__DIR__ . '/.env');

// --- 1. CONFIGURATION ---
$account         = $_ENV['NS_ACCOUNT_ID'] ?? '';
$consumer_key    = $_ENV['NS_CONSUMER_KEY'] ?? '';
$consumer_secret = $_ENV['NS_CONSUMER_SECRET'] ?? '';
$token_id        = $_ENV['NS_TOKEN_ID'] ?? '';
$token_secret    = $_ENV['NS_TOKEN_SECRET'] ?? '';

// 🚨 DEBUG: VERIFY VALUES ARE LOADED
if (!$account || !$consumer_key || !$token_id) {
    die("<pre>❌ ENV NOT LOADED PROPERLY\n" . print_r($_ENV, true) . "</pre>");
}

$url_account = str_replace('_', '-', strtolower($account));
$url = "https://{$url_account}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql";

// ⚠️ IMPORTANT: DO NOT ENCODE REALM
$realm = $account;

// --- 2. QUERY ---
$query_data = json_encode([
    "q" => "SELECT companyname, email FROM customer FETCH FIRST 10 ROWS ONLY"
]);

// --- 3. OAUTH ---
$nonce = bin2hex(random_bytes(16));
$timestamp = time();

$oauth_params = [
    'oauth_consumer_key'     => $consumer_key,
    'oauth_nonce'            => $nonce,
    'oauth_signature_method' => 'HMAC-SHA256',
    'oauth_timestamp'        => $timestamp,
    'oauth_token'            => $token_id,
    'oauth_version'          => '1.0'
];

ksort($oauth_params);


// Build parameter string
$param_pairs = [];
foreach ($oauth_params as $key => $value) {
    $param_pairs[] = rawurlencode($key) . '=' . rawurlencode($value);
}

$param_string = implode('&', $param_pairs);

// Base string
$base_string = 'POST&' . rawurlencode($url) . '&' . rawurlencode($param_string);

// Signing key
$signing_key = rawurlencode($consumer_secret) . '&' . rawurlencode($token_secret);

// Signature
$signature = base64_encode(hash_hmac('sha256', $base_string, $signing_key, true));

// Build Authorization header (REALM NOT ENCODED)
$auth_header = 'OAuth realm="' . $realm . '",'
    . 'oauth_consumer_key="' . rawurlencode($consumer_key) . '",'
    . 'oauth_token="' . rawurlencode($token_id) . '",'
    . 'oauth_signature_method="HMAC-SHA256",'
    . 'oauth_timestamp="' . $timestamp . '",'
    . 'oauth_nonce="' . $nonce . '",'
    . 'oauth_version="1.0",'
    . 'oauth_signature="' . rawurlencode($signature) . '"';

// --- 4. CURL ---
$ch = curl_init($url);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $query_data,
    CURLOPT_HTTPHEADER => [
        "Authorization: $auth_header",
        "Content-Type: application/json",
        "Prefer: transient"
    ],
    CURLOPT_SSL_VERIFYPEER => false
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($response === false) {
    die("cURL Error: " . curl_error($ch));
}

curl_close($ch);

$results = json_decode($response, true);
?>

<!DOCTYPE html>
<html>
<head>
    <title>NetSuite Customers</title>
</head>
<body>

<h2>NetSuite Customers (First 10)</h2>

<?php if ($http_code === 200 && isset($results['items'])): ?>

<table border="1" cellpadding="10">
    <tr>
        <th>Name</th>
        <th>Email</th>
    </tr>

    <?php foreach ($results['items'] as $row): ?>
        <tr>
            <td><?= htmlspecialchars($row['companyname'] ?? 'N/A') ?></td>
            <td><?= htmlspecialchars($row['email'] ?? 'N/A') ?></td>
        </tr>
    <?php endforeach; ?>

</table>

<?php else: ?>

<h3 style="color:red;">Error</h3>
<p>Status Code: <?= $http_code ?></p>

<pre>
Response:
<?= htmlspecialchars($response) ?>

Base String:
<?= $base_string ?>

Auth Header:
<?= $auth_header ?>
</pre>

<?php endif; ?>

</body>
</html>