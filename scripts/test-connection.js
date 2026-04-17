/**
 * Diagnostic v2 — writes results to JSON file for easy reading
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const fs = require('fs');

const accountId = process.env.NS_ACCOUNT_ID;
const clientId = process.env.NS_CLIENT_ID;
const certId = process.env.NS_CERTIFICATE_ID;
const pk = fs.readFileSync('./private_key.pem', 'utf8');

const urlAccount = accountId.replace(/_/g, '-').toLowerCase();
const tokenUrl = `https://${urlAccount}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

const results = [];

async function tryConfig(label, config) {
    const { alg, scope, aud, issOverride } = config;

    const payload = {
        iss: issOverride || clientId,
        scope: scope,
        aud: aud || tokenUrl,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300
    };

    const token = jwt.sign(payload, pk, {
        algorithm: alg,
        header: { alg: alg, typ: 'JWT', kid: certId }
    });

    const targetUrl = aud || tokenUrl;
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: token
    });

    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
        const txt = await res.text();
        results.push({ label, status: res.status, response: txt, aud: targetUrl, scope, alg });
    } catch (e) {
        results.push({ label, status: 'ERROR', response: e.message, aud: targetUrl, scope, alg });
    }
}

(async () => {
    await tryConfig('PS256_restlets_rest_webservices', { alg: 'PS256', scope: 'restlets rest_webservices' });
    await tryConfig('PS256_rest_webservices', { alg: 'PS256', scope: 'rest_webservices' });
    await tryConfig('PS256_restlets', { alg: 'PS256', scope: 'restlets' });
    await tryConfig('RS256_rest_webservices', { alg: 'RS256', scope: 'rest_webservices' });
    await tryConfig('RS256_restlets', { alg: 'RS256', scope: 'restlets' });
    await tryConfig('RS256_restlets_rest_webservices', { alg: 'RS256', scope: 'restlets rest_webservices' });
    await tryConfig('PS256_lowercase_clientid', { alg: 'PS256', scope: 'rest_webservices', issOverride: clientId.toLowerCase() });
    await tryConfig('PS256_short_aud', { alg: 'PS256', scope: 'rest_webservices', aud: `https://${urlAccount}.suitetalk.api.netsuite.com` });

    // Write results
    fs.writeFileSync('./diagnostic-results.json', JSON.stringify({ config: { accountId, clientId, certId, tokenUrl }, results }, null, 2));
    console.log('DONE - results written to diagnostic-results.json');
})();
