
require('dotenv').config();
const { getAccessToken } = require('./netsuite-auth');

async function test() {
    try {
        console.log("Starting token exchange test...");
        const token = await getAccessToken(true);
        console.log("Token obtained successfully!");
        console.log("Token length:", token.length);
    } catch (err) {
        console.error("Token test failed:", err.message);
    }
}

test();
