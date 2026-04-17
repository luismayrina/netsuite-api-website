require('dotenv').config();
const { runSuiteQL } = require('./netsuite-query');

async function test() {
    try {
        console.log("Fetching one invoice to inspect fields...");
        // Use a more specific query to avoid long scans
        const query = `SELECT id, tranid, trandate, entity FROM transaction WHERE type = 'CustInvc' AND ROWNUM <= 1`;
        console.log("Query:", query);
        const result = await runSuiteQL(query, 1, 0);

        if (result && result.items && result.items.length > 0) {
            console.log("SUCCESS! Found invoice:", result.items[0].tranid);
            const invoiceId = result.items[0].id;

            console.log("\nFetching ALL fields for this specific invoice ID...");
            const fullQuery = `SELECT * FROM transaction WHERE id = ${invoiceId}`;
            const fullResult = await runSuiteQL(fullQuery, 1, 0);

            if (fullResult && fullResult.items && fullResult.items.length > 0) {
                console.log("Full data keys:");
                console.log(JSON.stringify(Object.keys(fullResult.items[0]).sort(), null, 2));
                console.log("\nSample Data (first 20 keys):");
                const sample = {};
                Object.keys(fullResult.items[0]).slice(0, 50).forEach(k => sample[k] = fullResult.items[0][k]);
                console.log(JSON.stringify(sample, null, 2));
            }
        } else {
            console.log("No invoices found to inspect.");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

test();
