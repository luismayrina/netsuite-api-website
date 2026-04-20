const ExcelJS = require('exceljs');

async function dump() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('template.xlsx');
    await wb.csv.writeFile('out.csv');
    console.log('done');
}
dump();
