/**
 * NetSuite API Website — Express Server
 * 
 * Routes:
 *   GET  /              → Serve frontend
 *   GET  /api/report    → Fetch rental revenue data (paginated)
 *   GET  /api/test      → Quick connectivity test
 */

const envResult = require('dotenv').config();

if (envResult.error) {
    console.error('⚠️  Warning: .env file not found or could not be loaded.');
    console.error('   Details:', envResult.error.message);
} else {
    console.log('✅ .env file loaded successfully.');
}

const express = require('express');
const path = require('path');
const { getAccessToken } = require('./netsuite-auth');
const { runSuiteQL, fetchAllRows } = require('./netsuite-query');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Serve Static Frontend ──────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Environment Diagnostics ───────────────────────────
const requiredEnv = [
    'NS_ACCOUNT_ID',
    'NS_CLIENT_ID',
    'NS_CERTIFICATE_ID',
    'NS_PRIVATE_KEY_PATH'
];

console.log('\n🔍 Environment Check:');
const missingEnv = [];
requiredEnv.forEach(key => {
    const value = process.env[key];
    if (value) {
        let displayValue = value;
        // Mask sensitive items
        if (key.includes('CLIENT_ID') || key.includes('CERTIFICATE_ID')) {
            displayValue = `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
        }
        console.log(`  [OK] ${key}: ${displayValue}`);
    } else {
        console.error(`  [MISSING] ${key}`);
        missingEnv.push(key);
    }
});

if (missingEnv.length > 0) {
    console.error('\n❌ CRITICAL: Missing required environment variables. The server will likely fail when processing requests.');
    console.error('   Please check your .env file or environment settings.');
}
console.log('');

app.get('/api/test', async (req, res) => {
    try {
        const result = await runSuiteQL(
            'SELECT companyname, email FROM customer FETCH FIRST 5 ROWS ONLY',
            5,
            0
        );
        res.json({
            success: true,
            message: 'Connected to NetSuite successfully!',
            sampleData: result.items,
            count: result.items.length
        });
    } catch (error) {
        console.error('Test connection error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ─── Production Revenue Report Query ───────────────────
const PRODUCTION_REVENUE_QUERY = `
  SELECT 
    t.id AS internal_id,
    t.createddate AS date_created,
    t.trandate AS date,
    BUILTIN.DF(t.postingperiod) AS period,
    t.custbody_ubix_inv_apprvddatetime AS date_time_approved,
    t.tranid AS document_number,
    c.custentity_ubix_cust_gencode AS sap_code,
    BUILTIN.DF(t.entity) AS company_name,
    SUBSTR(BUILTIN.DF(t.entity), 1, 8) AS formula_text,
    t.entity AS customer_id,
    t.custbody_ubix_trans_rsano AS rsa_no,
    t.custbody_ubix_inv_pr_mcmdlserial AS model_serial_no,
    t.custbody_ubix_inv_periodcovered AS period_covered,
    BUILTIN.DF(t.location) AS location,
    BUILTIN.DF(t.custbody_cseg_ubix_revseg1) AS segment,
    BUILTIN.DF(t.custbody_cseg_ubix_revseg2) AS sub_class,
    BUILTIN.DF(t.custbody_cseg_ubix_revseg3) AS revenue_segment,
    BUILTIN.DF(t.custbody_ubix_invoice_invoicetype) AS invoice_type,
    BUILTIN.DF(tl.item) AS item,
    tl.custcol_ubix_invoice_rsa_presereading AS present_reading,
    tl.custcol_ubix_invoice_rsa_prevreading AS previous_reading,
    tl.custcol_ubix_invoice_rsa_ntcopies AS net_copies,
    tl.custcol_ubix_invoice_rsa_copiesbill AS billing_copies,
    ABS(tl.amount) AS amount,
    ABS(NVL(t.custbody_ubix_cwt, 0) + NVL(t.custbody_ubix_cvat, 0) + t.custbody_ubix_inv_amountdue) AS total_amount,
    t.tranid AS invoice_no,
    BUILTIN.DF(t.custbody_ubix_custpymt_receiptlocation) AS receipt_location,
    BUILTIN.DF(t.voided) AS reversal_number,
    BUILTIN.DF(t.custbody_ubix_inv_prepby) AS prepared_by,
    t.custbody_ubix_inv_prepby AS prepared_by_id,
    BUILTIN.DF(t.custbody_ubix_inv_apprvdby) AS approved_by,
    t.custbody_ubix_inv_apprvdby AS approved_by_id,
    BUILTIN.DF(t.createdby) AS created_by,
    t.createdby AS created_by_id,
    BUILTIN.DF(t.entity) AS entity_name,
    tl.custcol_ubix_invoice_rsa_mcc AS mcc,
    tl.custcol_ubix_invoice_mcv AS mvc,
    tl.custcol_ubix_invoice_rsa_frspldcopies AS free_copies,
    tl.custcol_ubix_inv_spoiled AS spoiled,
    tl.custcol_ubix_inv_testdemo AS testing_demo,
    t.custbody_ubix_inv_pr_particulars AS particulars,
    tl.memo AS description_others,
    t.otherrefnum AS po_check_number,
    t.custbody_ph4014_wtax_code AS withholding_tax_code,
    t.custbody_ubix_cvat AS creditable_vat,
    t.custbody_ubix_cwt AS creditable_wh_tax

  FROM 
    transaction t
  JOIN 
    transactionline tl ON t.id = tl.transaction
  LEFT JOIN 
    customer c ON t.entity = c.id

  WHERE 
    t.type = 'CustInvc'
    AND tl.mainline = 'F'
    AND tl.taxline = 'F'
    AND t.posting = 'T'
    AND BUILTIN.DF(t.customform) IN ('UBIX 2024.1 : Invoice - MRT', 'UBIX 2025.1 : Invoice - MRT')

  ORDER BY 
    t.trandate DESC, t.tranid DESC
  FETCH FIRST 5000 ROWS ONLY
`;

// ─── API: Fetch Report Data (Paginated) ─────────────────
app.get('/api/report', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 1000, 1000);
        const offset = parseInt(req.query.offset) || 0;

        const result = await runSuiteQL(PRODUCTION_REVENUE_QUERY.trim(), limit, offset);

        res.json({
            success: true,
            items: result.items,
            hasMore: result.hasMore,
            totalResults: result.totalResults,
            offset: result.offset,
            count: result.count,
            limit: limit
        });
    } catch (error) {
        console.error('Report API error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ─── API: Fetch ALL Report Data (Full Pagination) ───────
app.get('/api/report/all', async (req, res) => {
    try {
        console.log('📊 Starting full report fetch (this may take a while for 100k+ rows)...');

        const allItems = await fetchAllRows(PRODUCTION_REVENUE_QUERY.trim(), 1000, (batch, total) => {
            console.log(`Fetched batch ${batch}, total rows: ${total}`);
        });

        res.json({
            success: true,
            items: allItems,
            totalResults: allItems.length
        });
    } catch (error) {
        console.error('Full report API error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ─── API: Fetch All Companies (for SOA dropdown) ────────
app.get('/api/companies', async (req, res) => {
    try {
        console.log('🔍 Fetching all active companies...');
        const query = "SELECT (entityid || ' ' || companyname) as name FROM customer WHERE isperson = 'F' AND isinactive = 'F' AND companyname IS NOT NULL ORDER BY entityid";
        
        const { fetchAllRows } = require('./netsuite-query');
        const companies = await fetchAllRows(query, 1000);

        res.json({
            success: true,
            items: companies.map(c => c.name),
            count: companies.length
        });
    } catch (error) {
        console.error('Companies API error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});
// ─── API: Export SOA ────────────────────────────────────
app.get('/api/export-soa', async (req, res) => {
    try {
        const { company: companyParam, start, end } = req.query;
        const companyList = Array.isArray(companyParam) ? companyParam : [companyParam];
        
        if (!companyParam || !start || !end) {
            return res.status(400).json({ success: false, error: 'Company, start date, and end date are required' });
        }

        const ExcelJS = require('exceljs');
        const moment = require('moment');

        console.log(`📊 Exporting SOA for [${companyList.length}] companies from [${start}] to [${end}]...`);

        const escapedCompanies = companyList.map(c => c.replace(/'/g, "''"));
        const inClause = escapedCompanies.map(c => `'${c}'`).join(',');

        let soaQuery = PRODUCTION_REVENUE_QUERY.replace(
            "t.type = 'CustInvc'",
            `t.type = 'CustInvc'\n    AND BUILTIN.DF(t.entity) IN (${inClause})`
        );
        soaQuery = soaQuery.replace("FETCH FIRST 5000 ROWS ONLY", "");

        const { fetchAllRows } = require('./netsuite-query');
        let items = await fetchAllRows(soaQuery.trim(), 1000, (batch, total) => {
            console.log(`Fetched batch ${batch}, total rows for SOA: ${total}`);
        });

        const startDate = moment(start).startOf('day');
        const endDate = moment(end).endOf('day');

        // Filter items within the period covered
        // Use explicit format to avoid moment deprecation warnings
        items = items.filter(row => {
            if (!row.date) return false;
            // NetSuite often returns MM/DD/YYYY or similar. We specify common formats.
            const d = moment(row.date, ['M/D/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], true);
            return d.isValid() && d.isSameOrAfter(startDate) && d.isSameOrBefore(endDate);
        });

        items.reverse();

        // If preview requested, return early with JSON
        if (req.query.preview === 'true') {
            return res.json({
                success: true,
                items: items,
                summary: {
                    count: items.length,
                    totalAmount: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
                }
            });
        }

        const wb = new ExcelJS.Workbook();
        const templatePath = require('path').join(__dirname, 'template.xlsx');
        await wb.xlsx.readFile(templatePath);
        const ws = wb.worksheets[0];

        // Header section mapping
        ws.getCell('I1').value = endDate.toDate();
        ws.getCell('I1').numFmt = 'mmmm d, yyyy';

        ws.getCell('C3').value = moment().format('MMMM D, YYYY');
        const clientCode = items.length > 0 ? items[0].sap_code : '';
        ws.getCell('C4').value = clientCode;
        const fullName = companyList[0];
        const nameOnly = clientCode ? fullName.replace(clientCode, '').trim() : fullName;
        ws.getCell('C5').value = nameOnly;
        ws.getCell('E10').value = endDate.format('MMMM D, YYYY');

        ws.getCell('I10').value = endDate.toDate();
        ws.getCell('I10').numFmt = 'd-mmm-yy';
        ws.getCell('J10').value = endDate.toDate();
        ws.getCell('J10').numFmt = 'd-mmm-yy';

        // Find "TOTAL" row
        let totalRowIdx = -1;
        ws.eachRow((row, rowNumber) => {
            const firstCell = String(row.getCell(2).value).trim();
            if (firstCell === 'TOTAL') totalRowIdx = rowNumber;
        });
        if (totalRowIdx === -1) {
            ws.eachRow((row, rowNumber) => {
                if (String(row.getCell(1).value).trim() === 'TOTAL') totalRowIdx = rowNumber;
            });
        }

        // --- Style Capture ---
        const dataRowStyles = [];
        const templateDataRow = ws.getRow(12);
        for (let c = 1; c <= 12; c++) {
            dataRowStyles[c] = templateDataRow.getCell(c).style;
        }

        if (totalRowIdx > 12) {
            ws.spliceRows(12, totalRowIdx - 12);
        }

        // Insert items
        let newRows = [];
        items.forEach(() => newRows.push([]));
        if (newRows.length > 1) {
            ws.spliceRows(12, 0, ...newRows);
        } else if (newRows.length === 1) {
            ws.spliceRows(12, 0, [[]]);
        }

        let r = 12;
        let sum90 = 0, sumPastDue = 0, sumTotal = 0;

        items.forEach(item => {
            const row = ws.getRow(r);
            for (let c = 1; c <= 12; c++) {
                if (dataRowStyles[c]) row.getCell(c).style = dataRowStyles[c];
            }

            const invDate = moment(item.date, ['M/D/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
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

        // Totals
        ws.getCell(r, 7).value = sumTotal;
        ws.getCell(r + 1, 7).value = sum90;
        ws.getCell(r + 2, 7).value = sumPastDue;
        ws.getCell(r + 3, 7).value = sum90 + sumPastDue;

        let arRowIdx = -1;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const firstCell = String(row.getCell(2).value);
            if (firstCell.includes('Total AR')) arRowIdx = rowNumber;
        });
        if (arRowIdx > 0) {
            ws.getCell(arRowIdx, 7).value = sumTotal;
        }

        // --- Fix Advisory Section ---
        const advisoryRows = [];
        ws.eachRow((row, rowNumber) => {
            const cellBValue = String(row.getCell(2).value);
            if (cellBValue.includes('IMPORTANT') || cellBValue.includes('ADVISORY')) {
                advisoryRows.push(rowNumber);
            }
        });

        if (advisoryRows.length > 0) {
            const firstAdvisoryRow = advisoryRows[0];
            const borderStyle = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            advisoryRows.forEach((rowNum, index) => {
                const row = ws.getRow(rowNum);

                // Only keep "IMPORTANT ADVISORY" title in Row B of the first row
                if (index > 0) {
                    row.getCell(2).value = null;
                }

                const advisoryTextValue = String(row.getCell(3).value);
                // Clean columns D-H if they have duplicate text
                for (let c = 4; c <= 8; c++) {
                    if (String(row.getCell(c).value) === advisoryTextValue) {
                        row.getCell(c).value = null;
                    }
                }

                // Merge C to G (3 to 7)
                try {
                    ws.mergeCells(rowNum, 3, rowNum, 7);
                } catch (e) {
                    // Ignore merge conflicts if already merged
                }

                // Apply borders to the merged block and label
                row.getCell(2).border = borderStyle;
                for (let c = 3; c <= 7; c++) {
                    row.getCell(c).border = borderStyle;
                }
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const filename = companyList.length > 1 ? `${companyList[0]}-and-others` : companyList[0];
        res.setHeader('Content-Disposition', `attachment; filename="SOA-${filename.replace(/[^\w\s-]/g, '')}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('SOA Export API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── API: Token Health Check ────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        const token = await getAccessToken();
        res.json({
            success: true,
            message: 'Token acquired successfully',
            tokenPreview: token.substring(0, 20) + '...'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ─── Fallback: Serve index.html ─────────────────────────
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🚀 NetSuite API Server running');
    console.log(`  🌐 http://localhost:${PORT}`);
    console.log('');
    console.log('  API Endpoints:');
    console.log(`  • GET /api/health     → Token health check`);
    console.log(`  • GET /api/test       → Quick connection test`);
    console.log(`  • GET /api/report     → Paginated report data`);
    console.log(`  • GET /api/report/all → Full report (all pages)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
});
