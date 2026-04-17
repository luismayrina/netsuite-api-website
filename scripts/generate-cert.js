/**
 * Generate RSA Key Pair + Self-Signed X.509 Certificate for NetSuite M2M OAuth 2.0
 * 
 * Run once: node generate-cert.js
 * 
 * Output:
 *   - private_key.pem  → Keep secret, used by your server to sign JWTs
 *   - certificate.pem  → Upload to NetSuite M2M Setup page
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

console.log('🔐 Generating 4096-bit RSA Key Pair (this may take a moment)...\n');

// Generate 4096-bit RSA key pair (NetSuite requires 3072 or 4096 bits)
const keypair = forge.pki.rsa.generateKeyPair({ bits: 4096 });

// Create a self-signed X.509 certificate
const cert = forge.pki.createCertificate();
cert.publicKey = keypair.publicKey;
cert.serialNumber = '01';

// Valid from now, for 2 years (NetSuite caps at 2 years max)
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 2);

// Certificate subject / issuer attributes
const attrs = [
    { name: 'commonName', value: 'NetSuite M2M Integration' },
    { name: 'organizationName', value: 'MyCompany' },
    { name: 'countryName', value: 'PH' }
];
cert.setSubject(attrs);
cert.setIssuer(attrs); // Self-signed: issuer = subject

// Extensions
cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }]
    }
]);

// Sign the certificate with the private key (SHA-256)
cert.sign(keypair.privateKey, forge.md.sha256.create());

// Convert to PEM format
const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
const certificatePem = forge.pki.certificateToPem(cert);

// Write files
const privateKeyPath = path.join(__dirname, 'private_key.pem');
const certificatePath = path.join(__dirname, 'certificate.pem');

fs.writeFileSync(privateKeyPath, privateKeyPem);
fs.writeFileSync(certificatePath, certificatePem);

console.log('✅ Files Generated Successfully!\n');
console.log('📁 Private Key:   ' + privateKeyPath);
console.log('📁 Certificate:   ' + certificatePath);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('📋 NEXT STEPS:');
console.log('');
console.log('   1. Go to NetSuite → Setup → Integration →');
console.log('      OAuth 2.0 Client Credentials (M2M) Setup');
console.log('');
console.log('   2. Create a new mapping:');
console.log('      • Entity:      Your user/employee');
console.log('      • Role:        Administrator (or appropriate role)');
console.log('      • Integration: Your M2M integration record');
console.log('      • Certificate: Upload "certificate.pem"');
console.log('');
console.log('   3. Copy the resulting Certificate ID');
console.log('      (format: custcertificate_...)');
console.log('');
console.log('   4. Paste it into your .env file as NS_CERTIFICATE_ID');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('⚠️  SECURITY: Never commit private_key.pem to version control!');
