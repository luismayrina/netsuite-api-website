/**
 * NetSuite OAuth 2.0 M2M Authentication Module
 * 
 * Handles:
 *   1. JWT Assertion creation (signed with private key using PS256)
 *   2. Token exchange with NetSuite's /token endpoint
 *   3. Token caching to avoid unnecessary requests
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// ─── Cached Token ────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Build the NetSuite token endpoint URL from account ID
 */
function getTokenUrl(accountId) {
    const urlAccount = accountId.replace(/_/g, '-').toLowerCase();
    return `https://${urlAccount}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
}

/**
 * Create a signed JWT assertion for the M2M flow
 */
function createJWTAssertion() {
    const accountId = process.env.NS_ACCOUNT_ID;
    const clientId = process.env.NS_CLIENT_ID;
    const certId = process.env.NS_CERTIFICATE_ID;
    const keyPath = path.resolve(process.env.NS_PRIVATE_KEY_PATH || './private_key.pem');

    if (!accountId || !clientId || !certId) {
        throw new Error(
            'Missing required environment variables. Check NS_ACCOUNT_ID, NS_CLIENT_ID, NS_CERTIFICATE_ID in .env'
        );
    }

    // Read the private key
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const tokenUrl = getTokenUrl(accountId);

    // JWT payload
    const payload = {
        iss: clientId,
        scope: 'rest_webservices',
        aud: tokenUrl,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300  // 5 minutes
    };

    // Sign with PS256 (RSA-PSS + SHA-256) — NetSuite's preferred algorithm
    const token = jwt.sign(payload, privateKey, {
        algorithm: 'PS256',
        header: {
            alg: 'PS256',
            typ: 'JWT',
            kid: certId
        }
    });

    return token;
}

/**
 * Exchange JWT assertion for an access token from NetSuite
 * Returns the access token string
 */
async function getAccessToken(forceRefresh = false) {
    // Return cached token if still valid (with 60s buffer)
    const now = Math.floor(Date.now() / 1000);
    if (!forceRefresh && cachedToken && tokenExpiresAt > now + 60) {
        console.log('🔑 Using cached access token');
        return cachedToken;
    }

    console.log('🔄 Requesting new access token from NetSuite...');

    const accountId = process.env.NS_ACCOUNT_ID;
    const tokenUrl = getTokenUrl(accountId);
    const assertion = createJWTAssertion();

    // POST to NetSuite token endpoint
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ Token request failed:', JSON.stringify(data, null, 2));
        throw new Error(`Token request failed (${response.status}): ${data.error_description || data.error || 'Unknown error'}`);
    }

    // Cache the token
    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600); // Default 1 hour

    console.log(`✅ Access token obtained (expires in ${data.expires_in || 3600}s)`);
    return cachedToken;
}

/**
 * Clear the cached token (useful for retry logic)
 */
function clearTokenCache() {
    cachedToken = null;
    tokenExpiresAt = 0;
}

module.exports = {
    createJWTAssertion,
    getAccessToken,
    clearTokenCache,
    getTokenUrl
};
