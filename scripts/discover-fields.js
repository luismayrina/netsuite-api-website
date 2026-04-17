require('dotenv').config();
const { runSuiteQL } = require('./netsuite-query');

async function discover() {
    console.log('--- Checking raw date field values ---');
    try {
        const res = await runSuiteQL(
            "SELECT t.tranid, t.createddate, t.custbody_ubix_inv_apprvddatetime FROM transaction t WHERE t.type = 'CustInvc' AND custbody_ubix_inv_apprvddatetime IS NOT NULL FETCH FIRST 3 ROWS ONLY",
            3, 0
        );
        console.log(JSON.stringify(res.items, null, 2));
    } catch (e) {
        console.error('Query Failed:', e.message);
    }
}

discover();
