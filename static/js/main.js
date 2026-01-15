// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const extractBtn = document.getElementById('extractBtn');
const extractTextBtn = document.getElementById('extractTextBtn');
const pasteText = document.getElementById('pasteText');
const processing = document.getElementById('processing');
const results = document.getElementById('results');
const emailCount = document.getElementById('emailCount');
const emailList = document.getElementById('emailList');
const copyAll = document.getElementById('copyAll');
const downloadCsv = document.getElementById('downloadCsv');
const toast = document.getElementById('toast');
const historyList = document.getElementById('historyList');
const clearHistory = document.getElementById('clearHistory');

// State
let extractedEmails = [];
let extractedData = [];
let currentFile = null;

// Utility Functions
function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Tab Navigation
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active to clicked tab and corresponding content
        tab.classList.add('active');
        const tabId = tab.dataset.tab + '-tab';
        document.getElementById(tabId).classList.add('active');
        
        // Load history if history tab
        if (tab.dataset.tab === 'history') {
            loadHistory();
        }
        
        // Hide results when switching tabs
        results.classList.remove('show');
    });
});

// File Upload Handlers
function handleFile(file) {
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    fileInfo.classList.add('show');
    extractBtn.classList.add('show');
    results.classList.remove('show');
}

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

removeFile.addEventListener('click', (e) => {
    e.stopPropagation();
    currentFile = null;
    fileInput.value = '';
    fileInfo.classList.remove('show');
    extractBtn.classList.remove('show');
    results.classList.remove('show');
});

// Drag and Drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Extract from File
extractBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    extractBtn.disabled = true;
    processing.classList.add('show');
    results.classList.remove('show');

    const formData = new FormData();
    formData.append('file', currentFile);

    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        processing.classList.remove('show');
        extractBtn.disabled = false;

        if (data.success) {
            extractedEmails = data.emails;
            extractedData = data.data;
            displayResults();
            showToast(`Found ${data.total} emails!`);
        } else {
            showToast(data.error || 'Extraction failed', true);
        }
    } catch (error) {
        processing.classList.remove('show');
        extractBtn.disabled = false;
        showToast('Network error. Please try again.', true);
        console.error('Error:', error);
    }
});

// Extract from Text
extractTextBtn.addEventListener('click', async () => {
    const text = pasteText.value.trim();
    
    if (!text) {
        showToast('Please paste some text first', true);
        return;
    }

    extractTextBtn.disabled = true;
    processing.classList.add('show');
    results.classList.remove('show');

    try {
        const response = await fetch('/api/extract-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        processing.classList.remove('show');
        extractTextBtn.disabled = false;

        if (data.success) {
            extractedEmails = data.emails;
            extractedData = data.data;
            displayResults();
            showToast(`Found ${data.total} emails!`);
        } else {
            showToast(data.error || 'Extraction failed', true);
        }
    } catch (error) {
        processing.classList.remove('show');
        extractTextBtn.disabled = false;
        showToast('Network error. Please try again.', true);
        console.error('Error:', error);
    }
});

// Display Results
function displayResults() {
    emailCount.textContent = extractedEmails.length;
    emailList.innerHTML = '';

    if (extractedEmails.length === 0) {
        emailList.innerHTML = `
            <div class="no-results">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <p>No emails found</p>
            </div>
        `;
    } else {
        extractedData.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'email-item';
            div.innerHTML = `
                <div class="email-number">${index + 1}</div>
                <div class="email-address">${item.email}</div>
                <div class="email-company">${item.company}</div>
                <button class="copy-single" data-email="${item.email}" title="Copy">📋</button>
            `;
            emailList.appendChild(div);
        });

        // Add copy handlers
        document.querySelectorAll('.copy-single').forEach(btn => {
            btn.addEventListener('click', () => {
                const email = btn.dataset.email;
                navigator.clipboard.writeText(email);
                showToast(`Copied: ${email}`);
            });
        });
    }

    results.classList.add('show');
}

// Copy All
copyAll.addEventListener('click', () => {
    if (extractedEmails.length === 0) return;
    navigator.clipboard.writeText(extractedEmails.join('\n'));
    showToast(`Copied ${extractedEmails.length} emails!`);
});

// Download CSV
downloadCsv.addEventListener('click', async () => {
    if (extractedEmails.length === 0) return;

    try {
        const response = await fetch('/api/download-csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ emails: extractedEmails })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'extracted_emails.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showToast('CSV downloaded!');
        } else {
            showToast('Download failed', true);
        }
    } catch (error) {
        showToast('Download failed', true);
        console.error('Error:', error);
    }
});

// Load History
async function loadHistory() {
    historyList.innerHTML = '<p class="loading">Loading history...</p>';

    try {
        const response = await fetch('/api/history');
        const data = await response.json();

        if (data.success && data.extractions.length > 0) {
            historyList.innerHTML = data.extractions.map(item => `
                <div class="history-item">
                    <div class="history-icon">📧</div>
                    <div class="history-details">
                        <div class="source">${item.source}</div>
                        <div class="meta">${item.total} emails • ${formatDate(item.time)}</div>
                    </div>
                    <button class="history-download" data-file="${item.filename.replace('.json', '.csv')}">
                        Download CSV
                    </button>
                </div>
            `).join('');

            // Add download handlers
            document.querySelectorAll('.history-download').forEach(btn => {
                btn.addEventListener('click', () => {
                    const csvFile = btn.dataset.file;
                    window.location.href = `/api/download/${csvFile}`;
                });
            });
        } else {
            historyList.innerHTML = '<p class="empty-state">No extraction history yet</p>';
        }
    } catch (error) {
        historyList.innerHTML = '<p class="empty-state">Failed to load history</p>';
        console.error('Error:', error);
    }
}

// Clear History
clearHistory.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all history?')) return;

    try {
        const response = await fetch('/api/clear-history', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            historyList.innerHTML = '<p class="empty-state">No extraction history yet</p>';
            showToast('History cleared');
        } else {
            showToast('Failed to clear history', true);
        }
    } catch (error) {
        showToast('Failed to clear history', true);
        console.error('Error:', error);
    }
});
