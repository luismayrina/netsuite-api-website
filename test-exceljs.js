const ExcelJS = require('exceljs');

async function test() {
    try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile('template.xlsx');
        const ws = wb.worksheets[0];

        for (let i = 1; i <= 30; i++) {
            const row = ws.getRow(i);
            const vals = row.values;
            // arrays in exceljs are 1-indexed, meaning vals[0] is always undefined empty
            if (vals && vals.length > 1) {
                console.log(`Row ${i}:`, JSON.stringify(vals.slice(1).map(v => typeof v === 'object' && v !== null && v.result !== undefined ? v.result : v)));
            }
        }
        console.log('Merged cells:', ws.model.merges);
    } catch (e) {
        console.log('FAILED xlsx:', e.message);
    }
}
test();
