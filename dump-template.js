const ExcelJS = require('exceljs');

async function dump() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('template.xlsx');
    const ws = wb.worksheets[0];

    for (let i = 1; i <= 30; i++) {
        const row = ws.getRow(i);
        const vals = row.values.slice(1).map((v, idx) => {
            if (v && v.richText) return v.richText.map(rt => rt.text).join('');
            if (typeof v === 'object' && v !== null && v.result !== undefined) return v.result;
            return v;
        });
        console.log(`R${i}: ${JSON.stringify(vals)}`);
    }
}
dump();
