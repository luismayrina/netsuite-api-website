const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf8');

const startStr = "app.get('/api/export-soa', async (req, res) => {";
const endStr = "});";
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error('Cannot find block!');
    process.exit(1);
}

const replacement = `app.get('/api/export-soa', async (req, res) => {
    try {
        const { company, start, end } = req.query;
        if (!company || !start || !end) {
            return res.status(400).json({ success: false, error: 'Company, start date, and end date are required' });
        }

        const ExcelJS = require('exceljs');
        const moment = require('moment');

        console.log(\`📊 Exporting SOA for [\${company}] from [\${start}] to [\${end}]...\`);

        const escapedCompany = company.replace(/'/g, "''");
        let soaQuery = PRODUCTION_REVENUE_QUERY.replace(
            "t.type = 'CustInvc'",
            \`t.type = 'CustInvc'\\n    AND BUILTIN.DF(t.entity) = '\${escapedCompany}'\`
        );
        soaQuery = soaQuery.replace("FETCH FIRST 5000 ROWS ONLY", "");

        const { fetchAllRows } = require('./netsuite-query');
        let items = await fetchAllRows(soaQuery.trim(), 1000, (batch, total) => {
            console.log(\`Fetched batch \${batch}, total rows for SOA: \${total}\`);
        });

        const startDate = moment(start).startOf('day');
        const endDate = moment(end).endOf('day');

        // Filter items within the period covered
        items = items.filter(row => {
            if (!row.date) return false;
            const d = moment(row.date);
            return d.isValid() && d.isSameOrAfter(startDate) && d.isSameOrBefore(endDate);
        });

        items.reverse();

        const wb = new ExcelJS.Workbook();
        const templatePath = require('path').join(__dirname, 'template.xlsx');
        await wb.xlsx.readFile(templatePath);
        const ws = wb.worksheets[0];

        // Header section mapping (Col 1 is A, Col 2 is B, etc.)
        // Top right Cut-off date (Row 1, Column I was index 9 in CSV dump)
        ws.getCell(1, 9).value = endDate.toDate();
        
        // DATE label is at B3, Value at C3
        ws.getCell('C3').value = moment().format('MMMM D, YYYY');

        const clientCode = items.length > 0 ? items[0].sap_code : '';
        // CLIENT CODE label at B4, Value at C4
        ws.getCell('C4').value = clientCode;
        // CLIENT NAME label at B5, Value at C5
        ws.getCell('C5').value = company;

        // Date under "STATEMENT OF ACCOUNT" title (Row 10, Col 5 in CSV)
        ws.getCell(10, 5).value = endDate.format('MMMM D, YYYY');

        // Find "TOTAL" row
        let totalRowIdx = -1;
        ws.eachRow((row, rowNumber) => {
            const firstCell = String(row.getCell(2).value).trim(); // B is Col 2
            if (firstCell === 'TOTAL') {
                totalRowIdx = rowNumber;
            }
        });

        // If not found by B, check A as fallback
        if (totalRowIdx === -1) {
            ws.eachRow((row, rowNumber) => {
                if (String(row.getCell(1).value).trim() === 'TOTAL') totalRowIdx = rowNumber;
            });
        }

        // Data starts at Row 12 (Header is Row 11)
        if (totalRowIdx > 12) {
            ws.spliceRows(12, totalRowIdx - 12);
        }

        // Insert items
        let newRows = [];
        items.forEach(() => newRows.push([]));
        if (newRows.length > 0) {
            ws.spliceRows(12, 0, ...newRows);
        }

        let r = 12;
        let sum90 = 0;
        let sumPastDue = 0;
        let sumTotal = 0;

        items.forEach(item => {
            const invDate = moment(item.date);
            const dueDate = moment(invDate).add(30, 'days');
            const invAge = endDate.diff(invDate, 'days');
            const pastDueDays = endDate.diff(dueDate, 'days');

            let remarks = 'CURRENT';
            if (pastDueDays > 90) remarks = '90+ DAYS AGE';
            else if (pastDueDays > 0) remarks = 'PAST DUE';

            const amount = parseFloat(item.amount) || 0;

            if (pastDueDays > 90 && amount > 0) sum90 += amount;
            else if (pastDueDays > 0 && amount > 0) sumPastDue += amount;
            sumTotal += amount;

            const row = ws.getRow(r);
            // Column mapping (B to J): 2 to 10
            row.getCell(2).value = invDate.toDate();
            row.getCell(3).value = item.invoice_no || item.document_number || '';
            row.getCell(4).value = dueDate.toDate();
            row.getCell(5).value = item.period_covered || item.period || '';
            
            let particulars = item.particulars || '';
            if (!particulars && item.model_serial_no) {
                particulars = (item.item || '') + (item.model_serial_no ? ' / ' + item.model_serial_no : '');
            }
            row.getCell(6).value = particulars;
            
            row.getCell(7).value = amount;
            row.getCell(8).value = remarks;
            row.getCell(9).value = invAge;
            row.getCell(10).value = pastDueDays;

            r++;
        });

        // Totals (Amount is Col 7 / G)
        ws.getCell(r, 7).value = sumTotal; // TOTAL row
        ws.getCell(r + 1, 7).value = sum90; // 90+ DAYS AGE row
        ws.getCell(r + 2, 7).value = sumPastDue; // PAST DUE row
        ws.getCell(r + 3, 7).value = sum90 + sumPastDue; // TOTAL PAST DUE row

        let arRowIdx = -1;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const firstCell = String(row.getCell(2).value);
            if (firstCell.includes('Total AR')) {
                arRowIdx = rowNumber;
            }
        });
        if (arRowIdx > 0) {
            ws.getCell(arRowIdx, 7).value = sumTotal; 
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', \`attachment; filename="SOA-\${escapedCompany}.xlsx"\`);

        await wb.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('SOA Export API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex + endStr.length);
fs.writeFileSync('server.js', newCode, 'utf8');
console.log('Successfully updated server.js with correct column mapping B-J and range support!');
