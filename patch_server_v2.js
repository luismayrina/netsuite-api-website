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
        // Note: For SOA, usually we show everything unpaid up to end date, 
        // but user specifically asked for "period covered" and "start/end"
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

        // Header section mapping based on dump
        // I1 (Col 9) is where "2025-03-31" was
        ws.getCell('I1').value = endDate.toDate();
        
        // B3:DATE, C3:Value
        ws.getCell('C3').value = moment().format('MMMM D, YYYY');

        const clientCode = items.length > 0 ? items[0].sap_code : '';
        // B4:CLIENT CODE, C4:Value
        ws.getCell('C4').value = clientCode;
        // B5:CLIENT NAME, C5:Value
        ws.getCell('C5').value = company;

        // Date under "STATEMENT OF ACCOUNT" title
        // CSV showed it at Row 10 Col 5 (E10)
        ws.getCell('E10').value = endDate.format('MMMM D, YYYY');

        // Find "TOTAL" row
        let totalRowIdx = -1;
        ws.eachRow((row, rowNumber) => {
            if (String(row.getCell(1).value).trim() === 'TOTAL') {
                totalRowIdx = rowNumber;
            }
        });

        // Remove dummy invoice lines dynamically starting from Row 12 (below header)
        if (totalRowIdx > 12) {
            ws.spliceRows(12, totalRowIdx - 12);
        }

        // Insert empty rows 
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

            // Age and Past Due days are relative to the END date
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
        // TOTAL row should be at index 'r'
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
        res.end();

    } catch (error) {
        console.error('SOA Export API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex + endStr.length);
fs.writeFileSync('server.js', newCode, 'utf8');
console.log('Successfully updated server.js with range support and formatting fixes!');
