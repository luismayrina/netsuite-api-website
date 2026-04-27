/**
 * NetSuite Dashboard — Frontend Application
 * 
 * Handles:
 *   - Fetching data from the Express API
 *   - Rendering data table with dynamic columns
 *   - Search/filter, column sorting, pagination
 *   - CSV export
 *   - Connection status monitoring
 */

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════
const state = {
    data: [],
    filteredData: [],
    columns: [],
    currentPage: 1,
    pageSize: 50,
    sortColumn: null,
    sortDirection: 'asc',
    searchQuery: '',
    isLoading: true,
    error: null,
    fetchStartTime: 0,
    allCompanies: []
};

// ═══════════════════════════════════════════════════════════
//  DOM Elements
// ═══════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const elements = {
    connectionStatus: $('connection-status'),
    statusDot: null,
    statusText: null,
    totalRows: $('total-rows'),
    totalAmount: $('total-amount'),
    totalCompanies: $('total-companies'),
    fetchTime: $('fetch-time'),
    searchInput: $('search-input'),
    btnRefresh: $('btn-refresh'),
    btnExport: $('btn-export'),
    btnExportSOA: $('btn-export-soa'),
    soaModalOverlay: $('soa-modal-overlay'),
    soaModalClose: $('soa-modal-close'),
    soaCompanySelect: $('soa-company-select'),
    soaCompanySearch: $('soa-company-search'),
    soaCompanyResults: $('soa-company-results'),
    soaSubContainer: $('soa-subcompanies-container'),
    soaSubList: $('soa-subcompanies-list'),
    soaStartDate: $('soa-start-date'),
    soaEndDate: $('soa-end-date'),
    btnGenerateSOA: $('btn-generate-soa'),
    loadingState: $('loading-state'),
    loadingProgress: $('loading-progress'),
    errorState: $('error-state'),
    errorMessage: $('error-message'),
    btnPreviewSOA: $('btn-preview-soa'),
    soaPreviewContainer: $('soa-preview-container'),
    soaPreviewContent: $('soa-preview-content'),
    soaPreviewTable: $('soa-preview-table'),
    tableWrapper: $('table-wrapper'),
    tableHead: $('table-head'),
    tableBody: $('table-body'),
    pagination: $('pagination'),
    pageStart: $('page-start'),
    pageEnd: $('page-end'),
    pageTotal: $('page-total'),
    pageNumber: $('page-number'),
    btnPrev: $('btn-prev'),
    btnNext: $('btn-next')
};

// Cache dot and text elements
elements.statusDot = elements.connectionStatus.querySelector('.status-dot');
elements.statusText = elements.connectionStatus.querySelector('.status-text');

// ═══════════════════════════════════════════════════════════
//  Initialization
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadData();
});

function setupEventListeners() {
    // Search with debounce
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = e.target.value.toLowerCase().trim();
            state.currentPage = 1;
            applyFilters();
            renderTable();
            updatePagination();
        }, 250);
    });

    // Refresh
    elements.btnRefresh.addEventListener('click', () => loadData());

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });

    // SOA Modal
    if (elements.btnExportSOA) {
        elements.btnExportSOA.addEventListener('click', openSOAModal);
    }
    if (elements.soaModalClose) {
        elements.soaModalClose.addEventListener('click', closeSOAModal);
    }
    if (elements.soaModalOverlay) {
        elements.soaModalOverlay.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeSOAModal();
        });
    }
    if (elements.btnGenerateSOA) {
        elements.btnGenerateSOA.addEventListener('click', generateSOA);
    }
    if (elements.btnPreviewSOA) {
        elements.btnPreviewSOA.addEventListener('click', previewSOA);
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal();
            if (typeof closeSOAModal === 'function') closeSOAModal();
        }
    });

    // Export CSV
    elements.btnExport.addEventListener('click', () => exportCSV());

    // Pagination
    elements.btnPrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderTable();
            updatePagination();
        }
    });

    elements.btnNext.addEventListener('click', () => {
        const totalPages = Math.ceil(state.filteredData.length / state.pageSize);
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderTable();
            updatePagination();
        }
    });

    // SOA Searchable Dropdown
    if (elements.soaCompanySearch) {
        elements.soaCompanySearch.addEventListener('input', (e) => {
            filterCompanies(e.target.value);
        });

        elements.soaCompanySearch.addEventListener('focus', () => {
            if (state.allCompanies.length > 0) {
                filterCompanies(elements.soaCompanySearch.value);
            }
        });

        elements.soaCompanySearch.addEventListener('blur', () => {
            setTimeout(() => {
                if (elements.soaCompanyResults) elements.soaCompanyResults.classList.add('hidden');
            }, 200);
        });

        elements.soaCompanySearch.addEventListener('keydown', (e) => {
            const items = elements.soaCompanyResults.querySelectorAll('.combobox-item');
            if (items.length === 0) return;

            let activeIdx = Array.from(items).findIndex(item => item.classList.contains('active'));

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeIdx < items.length - 1) {
                    if (activeIdx >= 0) items[activeIdx].classList.remove('active');
                    items[activeIdx + 1].classList.add('active');
                    items[activeIdx + 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeIdx > 0) {
                    items[activeIdx].classList.remove('active');
                    items[activeIdx - 1].classList.add('active');
                    items[activeIdx - 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0) {
                    selectCompany(items[activeIdx].dataset.value);
                }
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  Data Loading
// ═══════════════════════════════════════════════════════════
async function loadData() {
    showLoading();
    state.fetchStartTime = performance.now();

    try {
        // Fetch first page to get data structure
        const response = await fetch('/api/report?limit=1000&offset=0');
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }

        let allItems = [...result.items];
        let offset = result.items.length;
        let hasMore = result.hasMore;
        let batchNum = 1;

        // Auto-paginate to get all data
        while (hasMore) {
            batchNum++;
            elements.loadingProgress.textContent = `Loading batch ${batchNum}... (${allItems.length} rows so far)`;

            const nextResponse = await fetch(`/api/report?limit=1000&offset=${offset}`);
            const nextResult = await nextResponse.json();

            if (!nextResult.success) {
                throw new Error(nextResult.error || 'Failed to fetch page');
            }

            allItems = allItems.concat(nextResult.items);
            hasMore = nextResult.hasMore;
            offset += nextResult.items.length;

            if (nextResult.items.length === 0 || allItems.length >= 5000) break;
        }

        state.data = allItems;
        state.filteredData = [...allItems];

        // Strict Column Order as requested by user
        state.columns = [
            'internal_id',
            'date_created',
            'date',
            'period',
            'date_time_approved',
            'document_number',
            'sap_code',
            'company_name',
            'formula_text',
            'customer_id',
            'rsa_no',
            'model_serial_no',
            'period_covered',
            'location',
            'segment',
            'sub_class',
            'revenue_segment',
            'invoice_type',
            'item',
            'present_reading',
            'previous_reading',
            'net_copies',
            'billing_copies',
            'amount',
            'total_amount',
            'invoice_no',
            'receipt_location',
            'reversal_number',
            'prepared_by',
            'approved_by',
            'created_by',
            'entity_name',
            'tax_item',
            'mcc',
            'mvc',
            'free_copies',
            'spoiled',
            'testing_demo',
            'particulars',
            'description_others',
            'po_check_number',
            'contact_person',
            'withholding_tax_code',
            'creditable_vat',
            'creditable_wh_tax'
        ];

        const elapsed = ((performance.now() - state.fetchStartTime) / 1000).toFixed(1);

        updateStats(elapsed);
        setConnectionStatus('connected', 'Connected');
        renderTableHeader();
        renderTable();
        updatePagination();
        showTable();
        renderSummaryCharts();

    } catch (error) {
        console.error('Load error:', error);
        showError(error.message);
        setConnectionStatus('error', 'Disconnected');
    }
}

// ═══════════════════════════════════════════════════════════
//  Filtering
// ═══════════════════════════════════════════════════════════
function applyFilters() {
    if (!state.searchQuery) {
        state.filteredData = [...state.data];
        return;
    }

    state.filteredData = state.data.filter(row => {
        return Object.values(row).some(value =>
            String(value || '').toLowerCase().includes(state.searchQuery)
        );
    });
}

// ═══════════════════════════════════════════════════════════
//  Sorting
// ═══════════════════════════════════════════════════════════
function sortByColumn(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }

    state.filteredData.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // Handle null/undefined
        if (valA == null) valA = '';
        if (valB == null) valB = '';

        // Try numeric comparison
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
            return state.sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        // String comparison
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        const cmp = strA.localeCompare(strB);
        return state.sortDirection === 'asc' ? cmp : -cmp;
    });

    state.currentPage = 1;
    renderTableHeader();
    renderTable();
    updatePagination();
}

// ═══════════════════════════════════════════════════════════
//  Rendering
// ═══════════════════════════════════════════════════════════
function renderTableHeader() {
    const headerRow = document.createElement('tr');

    state.columns.forEach(col => {
        const th = document.createElement('th');
        const label = formatColumnName(col);
        const isSorted = state.sortColumn === col;
        const arrow = state.sortDirection === 'asc' ? '↑' : '↓';

        th.innerHTML = `${label} <span class="sort-arrow">${isSorted ? arrow : '↕'}</span>`;
        th.className = isSorted ? 'sorted' : '';
        th.addEventListener('click', () => sortByColumn(col));
        headerRow.appendChild(th);
    });

    elements.tableHead.innerHTML = '';
    elements.tableHead.appendChild(headerRow);
}

function renderTable() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageData = state.filteredData.slice(start, end);

    const fragment = document.createDocumentFragment();

    pageData.forEach(row => {
        const tr = document.createElement('tr');
        tr.title = `Click to view history for ${row.model_serial_no || 'this machine'}`;
        tr.addEventListener('click', () => openRowModal(row));

        state.columns.forEach(col => {
            const td = document.createElement('td');
            const formatted = getFormattedValue(col, row);

            // Add CSS classes for amount fields
            if (col.toLowerCase().includes('amount') || col.toLowerCase().includes('vat') || col.toLowerCase().includes('tax')) {
                td.className = 'amount positive'; // amounts from query are strictly positive
            }

            td.textContent = formatted;
            tr.appendChild(td);
        });

        fragment.appendChild(tr);
    });

    elements.tableBody.innerHTML = '';
    elements.tableBody.appendChild(fragment);
}

// ═══════════════════════════════════════════════════════════
//  Stats + Pagination
// ═══════════════════════════════════════════════════════════
function updateStats(elapsed) {
    elements.totalRows.textContent = state.data.length.toLocaleString();
    elements.fetchTime.textContent = elapsed + 's';

    // Calculate total amount (sum of any 'amount' column)
    const amountCol = state.columns.find(c => c.toLowerCase().includes('amount'));
    if (amountCol) {
        const total = state.data.reduce((sum, row) => {
            const val = parseFloat(row[amountCol]);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);
        elements.totalAmount.textContent = formatCurrency(total);
    } else {
        elements.totalAmount.textContent = 'N/A';
    }

    // Count unique companies
    const companyCol = state.columns.find(c =>
        c.toLowerCase().includes('company') ||
        c.toLowerCase().includes('entity') ||
        c.toLowerCase().includes('customer')
    );
    if (companyCol) {
        const unique = new Set(state.data.map(r => r[companyCol]).filter(Boolean));
        elements.totalCompanies.textContent = unique.size.toLocaleString();
    } else {
        elements.totalCompanies.textContent = 'N/A';
    }
}

function updatePagination() {
    const total = state.filteredData.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const start = Math.min((state.currentPage - 1) * state.pageSize + 1, total);
    const end = Math.min(state.currentPage * state.pageSize, total);

    elements.pageStart.textContent = total === 0 ? 0 : start;
    elements.pageEnd.textContent = end;
    elements.pageTotal.textContent = total.toLocaleString();
    elements.pageNumber.textContent = `Page ${state.currentPage} of ${totalPages}`;

    elements.btnPrev.disabled = state.currentPage <= 1;
    elements.btnNext.disabled = state.currentPage >= totalPages;
}

// ═══════════════════════════════════════════════════════════
//  UI State Management
// ═══════════════════════════════════════════════════════════
function showLoading() {
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.tableWrapper.classList.add('hidden');
    elements.pagination.classList.add('hidden');
    elements.loadingProgress.textContent = '';
}

function showError(message) {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.remove('hidden');
    elements.tableWrapper.classList.add('hidden');
    elements.pagination.classList.add('hidden');
    elements.errorMessage.textContent = message;
}

function showTable() {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.tableWrapper.classList.remove('hidden');
    elements.pagination.classList.remove('hidden');
}

function setConnectionStatus(status, text) {
    elements.statusDot.className = 'status-dot ' + status;
    elements.statusText.textContent = text;
}

async function loadCompanies() {
    try {
        const response = await fetch('/api/companies');
        const data = await response.json();
        if (data.success) {
            state.allCompanies = data.items;
            return data.items;
        }
        return [];
    } catch (err) {
        console.error('Failed to load companies:', err);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════
//  SOA Export
// ═══════════════════════════════════════════════════════════
async function openSOAModal() {
    if (elements.soaModalOverlay) {
        elements.soaModalOverlay.classList.remove('hidden');
    }

    // Reset search
    if (elements.soaCompanySearch) {
        elements.soaCompanySearch.value = '';
        elements.soaCompanySelect.value = '';
    }

    // Ensure companies are loaded
    if (state.allCompanies.length === 0) {
        elements.soaCompanySearch.placeholder = 'Loading companies...';
        elements.soaCompanySearch.disabled = true;
        await loadCompanies();
        elements.soaCompanySearch.placeholder = 'Type to search company...';
        elements.soaCompanySearch.disabled = false;
    }
}

function filterCompanies(query) {
    if (!elements.soaCompanyResults) return;
    
    const term = query.toLowerCase().trim();
    const filtered = state.allCompanies.filter(c => c.toLowerCase().includes(term));
    
    if (filtered.length === 0) {
        elements.soaCompanyResults.innerHTML = '<div class="combobox-no-results">No companies found</div>';
    } else {
        const html = filtered.slice(0, 100).map((comp, idx) => {
            let displayed = comp;
            if (term) {
                // Escape special regex characters in the term to avoid errors
                const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                displayed = comp.replace(new RegExp(`(${escapedTerm})`, 'gi'), '<mark>$1</mark>');
            }
            return `<div class="combobox-item" data-value="${comp}">${displayed}</div>`;
        }).join('');
        elements.soaCompanyResults.innerHTML = html;

        // Add click listeners to items
        elements.soaCompanyResults.querySelectorAll('.combobox-item').forEach(item => {
            item.addEventListener('click', () => selectCompany(item.dataset.value));
        });
    }
    
    elements.soaCompanyResults.classList.remove('hidden');
}

function selectCompany(value) {
    elements.soaCompanySearch.value = value;
    elements.soaCompanySelect.value = value;
    elements.soaCompanyResults.classList.add('hidden');

    // Find sub-companies
    // A sub-company usually starts with the parent ID followed by a colon
    // e.g., "CC000014" -> "CC000014:1"
    const parentId = value.split(' ')[0]; // Extract the ID part (e.g. "CC000014")
    const subCompanies = state.allCompanies.filter(c => 
        c !== value && (c.startsWith(parentId + ':') || c.startsWith(parentId + ' :'))
    );

    if (subCompanies.length > 0) {
        elements.soaSubList.innerHTML = subCompanies.map(sub => `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; color: var(--text-secondary);">
                <input type="checkbox" class="soa-sub-check" value="${sub}" checked style="width: 16px; height: 16px; accent-color: var(--accent-indigo);" />
                <span>${sub}</span>
            </label>
        `).join('');
        elements.soaSubContainer.classList.remove('hidden');
    } else {
        elements.soaSubContainer.classList.add('hidden');
        elements.soaSubList.innerHTML = '';
    }
}

async function previewSOA() {
    const mainCompany = elements.soaCompanySelect.value;
    const startDate = elements.soaStartDate.value;
    const endDate = elements.soaEndDate.value;

    if (!mainCompany) {
        alert('Please select a Company Name.');
        return;
    }

    const selectedCompanies = [mainCompany];
    const subChecks = document.querySelectorAll('.soa-sub-check:checked');
    subChecks.forEach(cb => selectedCompanies.push(cb.value));

    if (!startDate || !endDate) {
        alert('Please select BOTH Start and End period dates.');
        return;
    }

    elements.btnPreviewSOA.disabled = true;
    elements.btnPreviewSOA.textContent = 'Loading...';
    elements.soaPreviewContainer.classList.add('hidden');

    try {
        const params = new URLSearchParams({
            start: startDate,
            end: endDate,
            preview: 'true'
        });
        selectedCompanies.forEach(c => params.append('company', c));

        const response = await fetch('/api/export-soa?' + params.toString());
        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'Failed to fetch preview');

        // Render Summary
        elements.soaPreviewContent.innerHTML = `
            <div>Transactions:</div><div style="text-align:right; color:var(--text-primary); font-weight:600;">${data.summary.count}</div>
            <div>Total Amount:</div><div style="text-align:right; color:var(--accent-indigo); font-weight:600;">${data.summary.totalAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
        `;

        // Render Table
        elements.soaPreviewTable.innerHTML = data.items.map(item => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                <td style="padding: 4px;">${item.date}</td>
                <td style="padding: 4px;">${item.invoice_no || '---'}</td>
                <td style="padding: 4px; text-align: right; color: var(--text-primary);">${(parseFloat(item.amount) || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            </tr>
        `).join('') || '<tr><td colspan="3" style="text-align:center; padding:20px;">No transactions in this period</td></tr>';

        elements.soaPreviewContainer.classList.remove('hidden');
    } catch (err) {
        alert('Preview error: ' + err.message);
    } finally {
        elements.btnPreviewSOA.disabled = false;
        elements.btnPreviewSOA.textContent = 'Preview';
    }
}

function closeSOAModal() {
    if (elements.soaModalOverlay) {
        elements.soaModalOverlay.classList.add('hidden');
    }
    if (elements.soaPreviewContainer) {
        elements.soaPreviewContainer.classList.add('hidden');
    }
    const statusMsg = document.getElementById('soa-status-message');
    if (statusMsg) statusMsg.textContent = '';
}

async function generateSOA() {
    const mainCompany = elements.soaCompanySelect.value;
    const startDate = elements.soaStartDate.value;
    const endDate = elements.soaEndDate.value;

    if (!mainCompany) {
        alert('Please select a Company Name.');
        return;
    }

    // Collect sub-companies
    const selectedCompanies = [mainCompany];
    const subChecks = document.querySelectorAll('.soa-sub-check:checked');
    subChecks.forEach(cb => selectedCompanies.push(cb.value));

    if (!startDate || !endDate) {
        alert('Please select BOTH Start and End period dates.');
        return;
    }

    elements.btnGenerateSOA.disabled = true;
    elements.btnGenerateSOA.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;"></div> <span>Generating...</span>';

    const statusMsg = document.getElementById('soa-status-message');
    if (statusMsg) {
        statusMsg.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> <span style="vertical-align:middle;">Preparing Excel file...</span>';
        statusMsg.style.color = 'var(--text-secondary)';
    }

    try {
        const params = new URLSearchParams({
            start: startDate,
            end: endDate
        });
        
        // Add all selected companies to the params
        selectedCompanies.forEach(c => params.append('company', c));

        const response = await fetch('/api/export-soa?' + params.toString(), {
            method: 'GET'
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Failed to generate SOA' }));
            throw new Error(err.error || 'Server error');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const [yy, mm, dd] = endDate.split('-');
        const shortFormat = `${mm}.${dd}.${yy.slice(2)}`;
        const cleanName = mainCompany.split(' ').slice(1).join(' ').replace(/[^\w\s-]/g, '').trim() || mainCompany.replace(/[^\w\s-]/g, '');
        
        a.download = `SOA - ${cleanName} ${shortFormat}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:var(--accent-green)">✓ SOA exported successfully!</span>';
        }
        setTimeout(closeSOAModal, 2000);
    } catch (err) {
        console.error('SOA Generation Error:', err);
        if (statusMsg) {
            statusMsg.innerHTML = `<span style="color:var(--accent-rose)">✕ Error: ${err.message}</span>`;
        }
    } finally {
        elements.btnGenerateSOA.disabled = false;
        elements.btnGenerateSOA.innerHTML = '<span>Generate Statement</span> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>';
    }
}

// ═══════════════════════════════════════════════════════════
//  CSV Export
// ═══════════════════════════════════════════════════════════
function exportCSV() {
    if (state.filteredData.length === 0) return;

    const headers = state.columns.map(c => formatColumnName(c));
    const rows = state.filteredData.map(row =>
        state.columns.map(col => {
            let val = getFormattedValue(col, row);
            if (val === '—') val = '';

            // Escape quotes and wrap in quotes if contains comma
            const str = String(val);
            return str.includes(',') || str.includes('"')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        })
    );

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `netsuite_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Map technical SuiteQL aliases to friendly report labels
 */
const COLUMN_MAP = {
    'internal_id': 'Internal ID',
    'date_created': 'Date Created',
    'date': 'Date',
    'period': 'Period',
    'date_time_approved': 'DATE AND TIME APPROVED',
    'document_number': 'Document Number',
    'sap_code': 'SAP CODE',
    'company_name': 'Company Name',
    'formula_text': 'Formula (Text)',
    'customer_id': 'ID',
    'rsa_no': 'RSA NO.',
    'model_serial_no': 'MC MODEL/SERIAL NO',
    'period_covered': 'PERIOD COVERED',
    'location': 'Location',
    'segment': 'SEGMENT',
    'sub_class': 'SUB-CLASS',
    'revenue_segment': 'REVENUE SEGMENT',
    'invoice_type': 'INVOICE TYPE',
    'item': 'Item',
    'present_reading': 'PRESENT READING',
    'previous_reading': 'PREVIOUS READING',
    'net_copies': 'NET COPIES',
    'billing_copies': 'COPIES FOR BILLING',
    'amount': 'Amount',
    'total_amount': 'Total Amount',
    'invoice_no': 'INVOICE NO.',
    'receipt_location': 'RECEIPT LOCATION',
    'reversal_number': 'Reversal Number',
    'prepared_by': 'PREPARED BY:',
    'approved_by': 'APPROVED BY:',
    'created_by': 'Created By',
    'entity_name': 'Name',
    'tax_item': 'Tax Item',
    'mcc': 'MCC',
    'mvc': 'MVC',
    'free_copies': 'Free Copies',
    'spoiled': 'Spoiled',
    'testing_demo': 'Testing/Demo',
    'particulars': 'PARTICULARS',
    'description_others': 'DESCRIPTION (OTHERS)',
    'po_check_number': 'PO/Check Number',
    'contact_person': 'CONTACT PERSON FOR BILLING',
    'withholding_tax_code': 'Withholding Tax Code',
    'creditable_vat': 'CREDITABLE VAT',
    'creditable_wh_tax': 'CREDITABLE WH TAX'
};

function formatColumnName(col) {
    if (COLUMN_MAP[col]) return COLUMN_MAP[col];

    return col
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
    }).format(num);
}

function getFormattedValue(col, row) {
    const value = row[col];

    // Administrative fields: Name (ID)
    if (['prepared_by', 'approved_by', 'created_by'].includes(col)) {
        const rawId = row[col + '_id'];
        if (rawId && value && value !== rawId) return `${value} (${rawId})`;
        return value ?? '—';
    }

    // Monetary fields
    if (col.toLowerCase().includes('amount') || col.toLowerCase().includes('vat') || col.toLowerCase().includes('tax')) {
        const num = parseFloat(value);
        if (!isNaN(num)) return formatCurrency(num);
        return value ?? '—';
    }

    // Date fields (raw strings to avoid timezone shift)
    if (col.toLowerCase().includes('date')) {
        return value ?? '—';
    }

    // Fallback
    return value ?? '—';
}

function formatDate(dateStr, includeTime = false) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };

        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.second = '2-digit';
            options.hour12 = true;
        }

        return date.toLocaleString('en-PH', options);
    } catch {
        return dateStr;
    }
}

// ═══════════════════════════════════════════════════════════
//  Chart Helpers
// ═══════════════════════════════════════════════════════════
const CHART_COLORS = {
    indigo: 'rgba(99,102,241,1)',
    indigoAlpha: 'rgba(99,102,241,0.15)',
    violet: 'rgba(139,92,246,1)',
    violetAlpha: 'rgba(139,92,246,0.15)',
    green: 'rgba(34,197,94,1)',
    greenAlpha: 'rgba(34,197,94,0.15)',
    amber: 'rgba(245,158,11,1)',
    rose: 'rgba(244,63,94,1)',
};

const CHART_PALETTE = [
    '#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#f43f5e',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#a855f7'
];

const CHART_BASE_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#9496a8', font: { family: 'Inter', size: 11 } } },
        tooltip: { callbacks: {} }
    },
    scales: {
        x: { ticks: { color: '#9496a8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9496a8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
    }
};

function makePhpTooltip(isHorizontal = false) {
    return {
        label: ctx => {
            const val = isHorizontal ? ctx.parsed.x : ctx.parsed.y;
            return ' ' + formatCurrency(val);
        }
    };
}

let summaryCharts = {};

function destroyCharts(charts) {
    Object.values(charts).forEach(c => { if (c) c.destroy(); });
}

// ─── Summary Charts ────────────────────────────────────────
function renderSummaryCharts() {
    const section = document.getElementById('charts-section');
    section.classList.remove('hidden');

    destroyCharts(summaryCharts);

    // Aggregate: period → total amount
    const byPeriod = {};
    const byCopies = {};
    const byCompany = {};
    const bySegment = {};

    state.data.forEach(row => {
        const period = row.period || 'Unknown';
        const company = row.company_name || 'Unknown';
        const segment = row.segment || 'Unknown';
        const amount = parseFloat(row.amount) || 0;
        const copies = parseFloat(row.net_copies) || 0;

        byPeriod[period] = (byPeriod[period] || 0) + amount;
        byCopies[period] = (byCopies[period] || 0) + copies;
        byCompany[company] = (byCompany[company] || 0) + amount;
        bySegment[segment] = (bySegment[segment] || 0) + amount;
    });

    // Sort period keys naturally
    const sortedPeriods = Object.keys(byPeriod).sort();

    // Chart 1 – Revenue by Period (bar)
    summaryCharts.period = new Chart(document.getElementById('chart-period'), {
        type: 'bar',
        data: {
            labels: sortedPeriods,
            datasets: [{
                label: 'Revenue',
                data: sortedPeriods.map(p => byPeriod[p]),
                backgroundColor: CHART_COLORS.indigoAlpha,
                borderColor: CHART_COLORS.indigo,
                borderWidth: 1.5,
                borderRadius: 4,
            }]
        },
        options: {
            ...CHART_BASE_OPTIONS,
            plugins: { ...CHART_BASE_OPTIONS.plugins, tooltip: { callbacks: makePhpTooltip() } }
        }
    });

    // Chart 2 – Top 10 Companies (horizontal bar)
    const top10 = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 10);
    summaryCharts.companies = new Chart(document.getElementById('chart-companies'), {
        type: 'bar',
        data: {
            labels: top10.map(e => e[0].length > 25 ? e[0].slice(0, 25) + '…' : e[0]),
            datasets: [{
                label: 'Revenue',
                data: top10.map(e => e[1]),
                backgroundColor: CHART_PALETTE,
                borderRadius: 4,
            }]
        },
        options: {
            ...CHART_BASE_OPTIONS,
            indexAxis: 'y',
            plugins: { ...CHART_BASE_OPTIONS.plugins, legend: { display: false }, tooltip: { callbacks: makePhpTooltip(true) } }
        }
    });

    // Chart 3 – Revenue by Segment (doughnut)
    // Remove null/unknown entries and sort by value descending
    const segEntries = Object.entries(bySegment)
        .filter(([k]) => k && k !== 'Unknown' && k !== 'null')
        .sort((a, b) => b[1] - a[1]);
    const segLabels = segEntries.map(([k]) => k);
    const segValues = segEntries.map(([, v]) => v);

    summaryCharts.segment = new Chart(document.getElementById('chart-segment'), {
        type: 'doughnut',
        data: {
            labels: segLabels,
            datasets: [{
                data: segValues,
                backgroundColor: CHART_PALETTE,
                borderColor: '#161625',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#9496a8', font: { family: 'Inter', size: 10 }, boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        // Doughnut uses ctx.parsed (a number), not ctx.parsed.y
                        label: ctx => {
                            const val = ctx.parsed;
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((val / total) * 100).toFixed(1) : 0;
                            return ` ${formatCurrency(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Chart 4 – Net Copies Trend (line)
    summaryCharts.copies = new Chart(document.getElementById('chart-copies'), {
        type: 'line',
        data: {
            labels: sortedPeriods,
            datasets: [{
                label: 'Net Copies',
                data: sortedPeriods.map(p => byCopies[p]),
                borderColor: CHART_COLORS.green,
                backgroundColor: CHART_COLORS.greenAlpha,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }]
        },
        options: { ...CHART_BASE_OPTIONS }
    });
}

// ─── Row Click → Machine History Modal ────────────────────
let modalCharts = {};

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    destroyCharts(modalCharts);
    modalCharts = {};
}

function openRowModal(row) {
    const machine = row.model_serial_no || '';
    const company = row.company_name || '';

    // Filter all rows for the same machine + company
    const history = state.data
        .filter(r => r.model_serial_no === machine && r.company_name === company)
        .sort((a, b) => {
            const da = new Date(a.date || a.date_created || 0);
            const db = new Date(b.date || b.date_created || 0);
            return da - db;
        });

    const labels = history.map(r => r.period || r.date || '');
    const amounts = history.map(r => parseFloat(r.amount) || 0);
    const copies = history.map(r => parseFloat(r.net_copies) || 0);
    const present = history.map(r => parseFloat(r.present_reading) || 0);
    const previous = history.map(r => parseFloat(r.previous_reading) || 0);

    // Modal header
    document.getElementById('modal-title').textContent = machine || 'Machine History';
    document.getElementById('modal-subtitle').textContent = `${company} • ${history.length} invoices in dataset`;

    // Summary stats
    const totalAmt = amounts.reduce((s, v) => s + v, 0);
    const totalCopy = copies.reduce((s, v) => s + v, 0);
    const avgAmt = history.length ? totalAmt / history.length : 0;

    document.getElementById('modal-stats').innerHTML = `
        <div class="modal-stat">
            <div class="modal-stat-label">Total Revenue</div>
            <div class="modal-stat-value">${formatCurrency(totalAmt)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Avg per Invoice</div>
            <div class="modal-stat-value">${formatCurrency(avgAmt)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Total Net Copies</div>
            <div class="modal-stat-value">${totalCopy.toLocaleString()}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Invoices</div>
            <div class="modal-stat-value">${history.length}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Location</div>
            <div class="modal-stat-value" style="font-size:0.85rem">${row.location || '—'}</div>
        </div>
    `;

    // Destroy old charts first
    destroyCharts(modalCharts);
    modalCharts = {};

    const lineOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: {} }
        },
        scales: {
            x: { ticks: { color: '#9496a8', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#9496a8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };

    // Chart A – Amount over time
    modalCharts.amount = new Chart(document.getElementById('modal-chart-amount'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Amount',
                data: amounts,
                backgroundColor: CHART_COLORS.indigoAlpha,
                borderColor: CHART_COLORS.indigo,
                borderWidth: 1.5,
                borderRadius: 4,
            }]
        },
        options: {
            ...lineOpts,
            plugins: { ...lineOpts.plugins, tooltip: { callbacks: makePhpTooltip() } }
        }
    });

    // Chart B – Net Copies over time
    modalCharts.copies = new Chart(document.getElementById('modal-chart-copies'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Net Copies',
                data: copies,
                borderColor: CHART_COLORS.green,
                backgroundColor: CHART_COLORS.greenAlpha,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }]
        },
        options: lineOpts
    });

    // Chart C – Present vs Previous Reading
    modalCharts.readings = new Chart(document.getElementById('modal-chart-readings'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Present Reading',
                    data: present,
                    borderColor: CHART_COLORS.violet,
                    backgroundColor: CHART_COLORS.violetAlpha,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: 'Previous Reading',
                    data: previous,
                    borderColor: CHART_COLORS.amber,
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3,
                    borderDash: [4, 4],
                }
            ]
        },
        options: {
            ...lineOpts,
            plugins: { ...lineOpts.plugins, legend: { display: true, labels: { color: '#9496a8', font: { family: 'Inter', size: 11 } } } }
        }
    });

    document.getElementById('modal-overlay').classList.remove('hidden');
}
