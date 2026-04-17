/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * 
 * Instructions:
 * 1. Upload this file to NetSuite (Customization -> Scripting -> Scripts -> New)
 * 2. Deploy it, and get the exact RESTlet URL it generates.
 * 3. Update the frontend/backend to hit this RESTlet URL.
 */
define(['N/search'], function (search) {
    function getSavedSearch(context) {
        const searchId = context.searchId || 'customsearch2228';
        const limit = parseInt(context.limit) || 1000;

        try {
            const loadedSearch = search.load({ id: searchId });
            const pagedData = loadedSearch.runPaged({ pageSize: 1000 });

            let allResults = [];

            // Loop through pages up to the requested limit
            pagedData.pageRanges.forEach(function (pageRange) {
                if (allResults.length >= limit) return;

                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach(function (result) {
                    if (allResults.length >= limit) return;

                    let row = { id: result.id };
                    result.columns.forEach(function (col) {
                        row[col.name || col.label] = result.getValue(col) || result.getText(col);
                    });

                    allResults.push(row);
                });
            });

            return {
                success: true,
                count: allResults.length,
                items: allResults
            };

        } catch (e) {
            log.error('RESTlet Error', e);
            return { success: false, error: e.message };
        }
    }

    return {
        get: getSavedSearch,
        post: getSavedSearch
    };
});
