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

// ─── API: Test Connection ───────────────────────────────
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
    -- BUILTIN.DF(tl.taxitem) AS tax_item,
    tl.custcol_ubix_invoice_rsa_mcc AS mcc,
    tl.custcol_ubix_invoice_mcv AS mvc,
    tl.custcol_ubix_invoice_rsa_frspldcopies AS free_copies,
    tl.custcol_ubix_inv_spoiled AS spoiled,
    tl.custcol_ubix_inv_testdemo AS testing_demo,
    t.custbody_ubix_inv_pr_particulars AS particulars,
    tl.memo AS description_others,
    t.otherrefnum AS po_check_number,
    -- c.custentity_ubix_inv_contactperson AS contact_person,
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
