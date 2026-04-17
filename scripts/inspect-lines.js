
require('dotenv').config();
const { runSuiteQL } = require('./netsuite-query');

async function test() {
    try {
        console.log("Fetching one invoice line to inspect columns...");
        const query = `
            SELECT tl.* 
            FROM transactionline tl 
            JOIN transaction t ON t.id = tl.transaction
            WHERE t.type = 'CustInvc' AND tl.mainline = 'F' AND ROWNUM <= 1
        `;
        const result = await runSuiteQL(query, 1, 0);

        if (result && result.items && result.items.length > 0) {
            console.log("SUCCESS! Line keys found:");
            console.log(JSON.stringify(Object.keys(result.items[0]).sort(), null, 2));

            console.log("\nSample Line Data (Sub-set):");
            const sample = {};
            const keys = Object.keys(result.items[0]);
            keys.filter(k => k.startsWith('custcol')).forEach(k => sample[k] = result.items[0][k]);
            console.log(JSON.stringify(sample, null, 2));
        } else {
            console.log("No invoice lines found to inspect.");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

test();
