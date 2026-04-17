/**
 * NetSuite SuiteQL Query Module
 * 
 * Handles:
 *   1. Running SuiteQL queries with Bearer token auth
 *   2. Automatic pagination for large result sets (100k+ rows)
 *   3. Retry logic with token refresh on 401
 */

const { getAccessToken, clearTokenCache } = require('./netsuite-auth');

/**
 * Build the SuiteQL REST API URL from account ID
 */
function getSuiteQLUrl(accountId) {
    const urlAccount = accountId.replace(/_/g, '-').toLowerCase();
    return `https://${urlAccount}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
}

/**
 * Execute a single SuiteQL query (one page)
 */
async function runSuiteQL(query, limit = 1000, offset = 0) {
    const accountId = process.env.NS_ACCOUNT_ID;
    const suiteqlUrl = getSuiteQLUrl(accountId);

    let accessToken = await getAccessToken();

    const body = JSON.stringify({ q: query });

    const makeRequest = async (token) => {
        return fetch(`${suiteqlUrl}?limit=${limit}&offset=${offset}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Prefer': 'transient'
            },
            body: body
        });
    };

    let response = await makeRequest(accessToken);

    if (response.status === 401) {
        clearTokenCache();
        accessToken = await getAccessToken(true);
        response = await makeRequest(accessToken);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SuiteQL query failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
        items: data.items || [],
        hasMore: data.hasMore || false,
        totalResults: data.totalResults || (data.items ? data.items.length : 0),
        offset: offset,
        count: data.count || (data.items ? data.items.length : 0)
    };
}

/**
 * Fetch ALL rows from a SuiteQL query by auto-paginating
 */
async function fetchAllRows(query, batchSize = 1000, onProgress = null) {
    let allItems = [];
    let offset = 0;
    let batchNum = 0;
    let hasMore = true;

    while (hasMore) {
        batchNum++;
        const result = await runSuiteQL(query, batchSize, offset);

        allItems = allItems.concat(result.items);
        hasMore = result.hasMore;
        offset += result.items.length;

        if (onProgress) onProgress(batchNum, allItems.length);
        if (result.items.length === 0) break;
    }

    return allItems;
}

module.exports = {
    runSuiteQL,
    fetchAllRows
};

