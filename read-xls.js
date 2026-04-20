const xlsx = require('xlsx');
const fs = require('fs');

function dumpFile(file) {
    try {
        const wb = xlsx.readFile(file);
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        const out = data.map((row, rIdx) => {
            if (row.length > 0) {
                const cols = row.map((cell, cIdx) => `[Col ${cIdx.toString().padStart(2, '0')}]: ${cell}`).join(' | ');
                return `Row ${rIdx.toString().padStart(2, '0')} ${cols}`;
            }
            return null;
        }).filter(x => x).join('\n');

        fs.writeFileSync(file + '.txt', out, 'utf8');
    } catch (e) {
        console.log('Error reading:', e.message);
    }
}

dumpFile('Sample SOA 02.27.25.xls');
dumpFile('Sample SOA 03.31.25.xls');
