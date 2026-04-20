const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf8');

const startStr = '// Reverse so it displays oldest invoices first';
const endStr = '        res.end();';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('Cannot find block!');
    process.exit(1);
}

const replacement = `// Reverse so it displays oldest invoices first
        items.reverse();

        const wb = new ExcelJS.Workbook();
        const templatePath = require('path').join(__dirname, 'template.xlsx');
        await wb.xlsx.readFile(templatePath);
        const ws = wb.worksheets[0];

        // Header section
        ws.getCell('H1').value = cutOffDate.toDate();
        
        ws.getCell('B2').value = moment().format('MMMM D, YYYY');

        const clientCode = items.length > 0 ? items[0].sap_code : '';
        ws.getCell('B3').value = clientCode;
        ws.getCell('B4').value = company;

        // Find "TOTAL" row
        let totalRowIdx = -1;
        ws.eachRow((row, rowNumber) => {
            if (row.getCell(1).value === 'TOTAL') {
                totalRowIdx = rowNumber;
            }
        });

        // Remove dummy invoice lines dynamically
        if (totalRowIdx > 8) {
            ws.spliceRows(8, totalRowIdx - 8);
        }

        // Insert empty rows 
        let newRows = [];
        items.forEach(() => newRows.push([]));
        if (newRows.length > 0) {
            ws.spliceRows(8, 0, ...newRows);
        }

        let r = 8;
        let sum90 = 0;
        let sumPastDue = 0;
        let sumTotal = 0;

        items.forEach(item => {
            const invDate = moment(item.date);
            const dueDate = moment(invDate).add(30, 'days');

            const invAge = cutOffDate.diff(invDate, 'days');
            const pastDueDays = cutOffDate.diff(dueDate, 'days');

            let remarks = 'CURRENT';
            if (pastDueDays > 90) remarks = '90+ DAYS AGE';
            else if (pastDueDays > 0) remarks = 'PAST DUE';

            const amount = parseFloat(item.amount) || 0;

            if (pastDueDays > 90 && amount > 0) sum90 += amount;
            else if (pastDueDays > 0 && amount > 0) sumPastDue += amount;
            sumTotal += amount;

            const row = ws.getRow(r);
            row.getCell(1).value = invDate.toDate();
            row.getCell(2).value = item.invoice_no || item.document_number || '';
            row.getCell(3).value = dueDate.toDate();
            row.getCell(4).value = item.period_covered || item.period || '';
            
            let particulars = item.particulars || '';
            if (!particulars && item.model_serial_no) {
                particulars = (item.item || '') + (item.model_serial_no ? ' / ' + item.model_serial_no : '');
            }
            row.getCell(5).value = particulars;
            
            row.getCell(6).value = amount;
            row.getCell(7).value = remarks;
            row.getCell(8).value = invAge;
            row.getCell(9).value = pastDueDays;

            r++;
        });

        // Setup totals manually
        ws.getCell(r, 6).value = sumTotal; // TOTAL row
        ws.getCell(r + 1, 6).value = sum90; // 90+ DAYS AGE row
        ws.getCell(r + 2, 6).value = sumPastDue; // PAST DUE row
        ws.getCell(r + 3, 6).value = sum90 + sumPastDue; // TOTAL PAST DUE row

        let arRowIdx = -1;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (String(row.getCell(1).value).includes('Total AR')) {
                arRowIdx = rowNumber;
            }
        });
        if (arRowIdx > 0) {
            ws.getCell(arRowIdx, 6).value = sumTotal; 
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', \`attachment; filename="SOA-\${escapedCompany}.xlsx"\`);

        await wb.xlsx.write(res);
        res.end();`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex + endStr.length);
fs.writeFileSync('server.js', newCode, 'utf8');
console.log('Successfully patched server.js!');
