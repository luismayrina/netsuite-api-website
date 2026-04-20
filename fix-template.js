const ExcelJS = require('exceljs');

async function fixTemplate() {
    try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile('template.xlsx');
        const ws = wb.worksheets[0];

        ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
            row.eachCell({ includeEmpty: false }, (cell, colNum) => {
                if (cell.type === ExcelJS.ValueType.Formula) {
                    const f = cell.formula;
                    const r = cell.result;
                    // Resetting the cell value to a normal formula breaks the shared linkage safely
                    if (f) {
                        cell.value = { formula: f, result: r };
                    }
                }
            });
        });

        await wb.xlsx.writeFile('template.xlsx');
        console.log('Fixed template formulas!');

        // Test if spliceRows still fails
        const wbTest = new ExcelJS.Workbook();
        await wbTest.xlsx.readFile('template.xlsx');
        const wsTest = wbTest.worksheets[0];
        wsTest.spliceRows(8, 0, [], [], []);
        console.log('spliceRows test passed!');

    } catch (e) {
        console.error('Error:', e);
    }
}
fixTemplate();
