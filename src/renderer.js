/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

console.log('Renderer.js loaded');

// Direct access to ipcRenderer (works with nodeIntegration: true)
let ipcRenderer;

// Use window.require to avoid webpack bundling electron
if (typeof window !== 'undefined' && window.require) {
  try {
    ipcRenderer = window.require('electron').ipcRenderer;
    console.log('ipcRenderer loaded:', !!ipcRenderer);
  } catch (e) {
    console.error('Failed to load ipcRenderer:', e);
  }
}

let currentSnapshot = null;
let allSnapshots = [];
let currentDelta = null;
let allDeltas = [];
let activeTab = 'snapshots'; // 'snapshots' or 'deltas'

// DOM Elements
let newSnapshotBtn, snapshotNameInput, snapshotList, emptyState, snapshotDetail;
let detailTitle, detailTimestamp, deleteBtn, processSearch, processList;
let compareSelect, compareBtn, comparisonView, integrityInfo, uploadBtn;

// Build the UI programmatically if HTML isn't present
function buildUI() {
  const htmlString = `
    <div class="container">
      <header>
        <div class="header-row">
          <div>
            <h1>📸 System Snapshot Viewer</h1>
            <p class="subtitle">View and manage system snapshots</p>
          </div>
          <button id="settingsBtn" class="btn btn-settings" title="Settings">⚙️</button>
        </div>
      </header>

      <div id="settingsPanel" class="settings-panel" style="display: none;">
        <div class="settings-content">
          <div class="settings-header">
            <h3>⚙️ Settings</h3>
            <button id="closeSettingsBtn" class="btn btn-close-settings">✕</button>
          </div>
          <div class="settings-body">
            <div class="setting-item">
              <label class="setting-label">
                <span>Automatic Snapshots</span>
                <div class="toggle-switch">
                  <input type="checkbox" id="autoSnapshotToggle" />
                  <span class="toggle-slider"></span>
                </div>
              </label>
              <p class="setting-desc">Automatically take snapshots at a regular interval</p>
            </div>
            <div class="setting-item">
              <label class="setting-label" for="autoSnapshotInterval">
                <span>Interval (minutes)</span>
                <input type="number" id="autoSnapshotInterval" class="input-field setting-input" min="1" max="1440" value="5" />
              </label>
              <p class="setting-desc">How often to take automatic snapshots (1–1440 min)</p>
            </div>
            <div id="autoSnapshotStatus" class="setting-status">Auto-snapshots: Off</div>
            <div class="setting-item">
              <label class="setting-label" for="maxSnapshotsInput">
                <span>Max Snapshots to Keep</span>
                <input type="number" id="maxSnapshotsInput" class="input-field setting-input" min="0" max="9999" value="0" />
              </label>
              <p class="setting-desc">Oldest unpinned snapshots are auto-deleted when this limit is exceeded. Set to 0 for unlimited.</p>
            </div>
            <div class="setting-item">
              <p class="setting-label"><span>Include in snapshot:</span></p>
              <div class="test-selector">
                <label class="test-option"><input type="checkbox" id="test-cpu"       checked> 💻 CPU &amp; OS <span class="tooltip-icon" title="Collects CPU manufacturer, brand, core count, and operating system/distro information">?</span></label>
                <label class="test-option"><input type="checkbox" id="test-memory"    checked> 🧠 Memory <span class="tooltip-icon" title="Collects total and used RAM, providing a snapshot of memory utilization">?</span></label>
                <label class="test-option"><input type="checkbox" id="test-processes" checked> ⚙️ Processes <span class="tooltip-icon" title="Captures all running processes with PID, CPU usage, and memory usage">?</span></label>
                <label class="test-option"><input type="checkbox" id="test-network"   checked> 🌐 Network <span class="tooltip-icon" title="Records network interfaces, IP addresses, and currently listening ports">?</span></label>
                <label class="test-option"><input type="checkbox" id="test-disk"      checked> 💾 Disk I/O <span class="tooltip-icon" title="Collects disk read/write throughput and operations per second">?</span></label>
                <label class="test-option"><input type="checkbox" id="test-users"     checked> 👤 Users <span class="tooltip-icon" title="Records currently logged-in users and session information">?</span></label>
              </div>
              <p class="setting-desc">Select which categories to collect in snapshots</p>
            </div>
            <div class="setting-item">
              <p class="setting-label"><span>Data Folder</span></p>
              <div id="dataFolderPath" class="data-folder-path">Loading...</div>
              <div class="data-folder-buttons">
                <button id="openDataFolderBtn" class="btn btn-small">📂 Open</button>
                <button id="moveDataFolderBtn" class="btn btn-small btn-primary">📁 Move</button>
                <button id="resetDataFolderBtn" class="btn btn-small btn-danger">↩️ Reset</button>
              </div>
              <p class="setting-desc">Where snapshot files are stored on disk</p>
            </div>
          </div>
        </div>
      </div>

      <div class="main-content">
        <div class="sidebar">
          <div class="sidebar-tabs">
            <button id="tabSnapshots" class="sidebar-tab active">📷 Snapshots</button>
            <button id="tabDeltas" class="sidebar-tab">📐 Deltas</button>
          </div>

          <div id="snapshotsPanel" class="tab-panel">
            <div class="snapshot-controls">
              <input 
                type="text" 
                id="snapshotName" 
                placeholder="Enter snapshot name..." 
                class="input-field"
                style="margin-bottom: 10px;"
              />
              <button id="newSnapshotBtn" class="btn btn-primary">
                📷 Take Snapshot
              </button>
            </div>
            <div class="snapshot-list-container">
              <h2>Saved Snapshots</h2>
              <div id="snapshotList" class="snapshot-list">
                <p class="loading">Loading snapshots...</p>
              </div>
            </div>
          </div>

          <div id="deltasPanel" class="tab-panel" style="display: none;">
            <div class="snapshot-controls">
              <h3 style="margin-bottom: 10px; font-size: 14px;">Create Delta</h3>
              <select id="deltaBeforeSelect" class="input-field" style="margin-bottom: 8px;">
                <option value="">Before snapshot...</option>
              </select>
              <select id="deltaAfterSelect" class="input-field" style="margin-bottom: 8px;">
                <option value="">After snapshot...</option>
              </select>
              <details class="delta-categories-details">
                <summary>Categories to compare</summary>
                <div class="test-selector" style="margin-top: 8px;">
                  <label class="test-option"><input type="checkbox" id="delta-cpu" checked> 💻 CPU &amp; OS</label>
                  <label class="test-option"><input type="checkbox" id="delta-memory" checked> 🧠 Memory</label>
                  <label class="test-option"><input type="checkbox" id="delta-processes" checked> ⚙️ Processes</label>
                  <label class="test-option"><input type="checkbox" id="delta-network" checked> 🌐 Network</label>
                  <label class="test-option"><input type="checkbox" id="delta-disk" checked> 💾 Disk</label>
                  <label class="test-option"><input type="checkbox" id="delta-users" checked> 👤 Users</label>
                </div>
              </details>
              <button id="createDeltaBtn" class="btn btn-primary" style="margin-top: 10px;">
                📐 Create Delta
              </button>
            </div>
            <div class="snapshot-list-container">
              <h2>Saved Deltas</h2>
              <div class="delta-filter">
                <label class="delta-filter-label">Filter by date &amp; time</label>
                <input type="datetime-local" id="deltaFilterFrom" class="input-field delta-date-input" />
                <input type="datetime-local" id="deltaFilterTo" class="input-field delta-date-input" />
                <button id="deltaFilterClearBtn" class="btn btn-small" style="margin-top:4px;">✕ Clear</button>
              </div>
              <div id="deltaList" class="snapshot-list">
                <p class="loading">Loading deltas...</p>
              </div>
            </div>
            <div class="sidebar-graph-controls">
              <div class="delta-filter">
                <label class="delta-filter-label">Graph time range</label>
                <input type="datetime-local" id="graphFilterFrom" class="input-field delta-date-input" />
                <input type="datetime-local" id="graphFilterTo" class="input-field delta-date-input" />
                <button id="graphFilterClearBtn" class="btn btn-small" style="margin-top:4px;">✕ Clear</button>
              </div>
              <button id="snapshotGraphBtn" class="btn btn-primary" style="width:100%" disabled>
                📊 Graph Snapshots
              </button>
            </div>
          </div>
        </div>

        <div class="main-view">
          <div id="emptyState" class="empty-state">
            <p>👈 Select a snapshot or delta to view details</p>
          </div>

          <div id="deltaDetail" class="snapshot-detail" style="display: none;">
            <div class="detail-header">
              <div>
                <h2 id="deltaTitle">Delta Details</h2>
                <p id="deltaTimestamp" class="timestamp"></p>
                <p id="deltaSnapshots" class="timestamp"></p>
                <div id="deltaCategoriesBadges" class="tests-run-badges"></div>
              </div>
              <div class="header-buttons">
                <button id="deleteDeltaBtn" class="btn btn-danger">🗑️ Delete</button>
              </div>
            </div>
            <div class="detail-content" id="deltaContent"></div>
          </div>

          <div id="deltaGraphView" class="snapshot-detail" style="display: none;">
            <div class="detail-header">
              <div>
                <h2>📊 Snapshot Trends</h2>
                <p id="graphPeriodLabel" class="timestamp"></p>
              </div>
              <div class="header-buttons">
                <button id="closeGraphBtn" class="btn btn-danger">✕ Close</button>
              </div>
            </div>
            <div class="detail-content" id="graphContent">
              <section>
                <h3>🧠 Memory Usage Over Time</h3>
                <div class="chart-container"><canvas id="memoryChart"></canvas></div>
              </section>
              <section>
                <h3>⚙️ Process Count Over Time</h3>
                <div class="chart-container"><canvas id="processChart"></canvas></div>
              </section>
              <section>
                <h3>🌐 Network Ports Over Time</h3>
                <div class="chart-container"><canvas id="networkChart"></canvas></div>
              </section>
              <section>
                <h3>💾 Disk I/O Over Time</h3>
                <div class="chart-container"><canvas id="diskChart"></canvas></div>
              </section>
            </div>
          </div>

          <div id="snapshotDetail" class="snapshot-detail" style="display: none;">
            <div class="detail-header">
              <div>
                <h2 id="detailTitle">Snapshot Details</h2>
                <p id="detailTimestamp" class="timestamp"></p>
                <div id="integrityInfo" class="integrity-info"></div>
                <div id="testsRunBadges" class="tests-run-badges"></div>
              </div>
              <div class="header-buttons">
                <select id="compareSelect" class="input-field" style="max-width: 200px;">
                  <option value="">Compare with...</option>
                </select>
                <button id="compareBtn" class="btn btn-primary"> Compare</button>
                <button id="pinBtn" class="btn btn-pin"> Pin</button>
                <button id="uploadBtn" class="btn btn-upload"> Upload</button>
                <button id="deleteBtn" class="btn btn-danger"> Delete</button>
              </div>
            </div>

            <div id="comparisonView" class="comparison-view" style="display: none;">
              <h3>📊 Comparison Results</h3>
              <div class="comparison-grid">
                <div class="comparison-card">
                  <h4>🆕 New Processes</h4>
                  <div id="newProcessesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>❌ Removed Processes</h4>
                  <div id="removedProcessesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>📈 Process Changes</h4>
                  <div id="processChangesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>🔌 New Listening Ports</h4>
                  <div id="newPortsList" class="comparison-list"></div>
                </div>
              </div>
            </div>

            <div class="detail-content">
              <section class="system-info">
                <h3>💻 System Information</h3>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="label">CPU Manufacturer</span>
                    <span id="cpuManufacturer" class="value">-</span>
                  </div>
                  <div class="info-item">
                    <span class="label">CPU Brand</span>
                    <span id="cpuBrand" class="value">-</span>
                  </div>
                  <div class="info-item">
                    <span class="label">CPU Cores</span>
                    <span id="cpuCores" class="value">-</span>
                  </div>
                  <div class="info-item">
                    <span class="label">Total Memory</span>
                    <span id="totalMemory" class="value">-</span>
                  </div>
                  <div class="info-item">
                    <span class="label">OS</span>
                    <span id="osInfo" class="value">-</span>
                  </div>
                  <div class="info-item">
                    <span class="label">Disk I/O</span>
                    <span id="diskInfo" class="value">-</span>
                  </div>
                </div>
              </section>

              <section class="network-section">
                <h3>🌐 Network</h3>
                <div class="network-info">
                  <div>
                    <strong>Network Interfaces:</strong>
                    <div id="networkInterfaces" class="details-list"></div>
                  </div>
                  <div>
                    <strong>Listening Ports:</strong>
                    <div id="listeningPorts" class="details-list"></div>
                  </div>
                </div>
              </section>

              <section class="filesystem-section">
                <h3>💾 Disk I/O</h3>
                <div id="filesystemInfo" class="details-list"></div>
              </section>

              <section class="processes-section">
                <h3>⚙️ Running Processes</h3>
                <div class="search-bar">
                  <input 
                    type="text" 
                    id="processSearch" 
                    placeholder="Search processes..." 
                    class="input-field"
                  />
                </div>
                <div id="processList" class="process-list">
                  <p class="loading">Loading processes...</p>
                </div>
              </section>

              <section class="users-section">
                <h3>👤 Logged-in Users</h3>
                <div id="usersList" class="details-list"></div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Always inject — ensures renderer.js is the single source of truth for the UI
  console.log('Injecting UI...');
  document.body.innerHTML = htmlString;
}

// Initialize when window is fully ready
function scheduleInit() {
  // Build UI first — renderer.js is the single source of truth
  buildUI();
  console.log('UI ready, initializing app...');
  initializeApp();
}

// Start the initialization
setTimeout(scheduleInit, 50);

function initializeApp() {
  console.log('Initializing app...');
  
  // Get DOM elements
  newSnapshotBtn = document.getElementById('newSnapshotBtn');
  snapshotNameInput = document.getElementById('snapshotName');
  snapshotList = document.getElementById('snapshotList');
  emptyState = document.getElementById('emptyState');
  snapshotDetail = document.getElementById('snapshotDetail');
  detailTitle = document.getElementById('detailTitle');
  detailTimestamp = document.getElementById('detailTimestamp');
  deleteBtn = document.getElementById('deleteBtn');
  processSearch = document.getElementById('processSearch');
  processList = document.getElementById('processList');
  compareSelect = document.getElementById('compareSelect');
  compareBtn = document.getElementById('compareBtn');
  comparisonView = document.getElementById('comparisonView');
  integrityInfo = document.getElementById('integrityInfo');
  uploadBtn = document.getElementById('uploadBtn');
  const pinBtn = document.getElementById('pinBtn');

  // Test selector checkboxes
  const testCheckboxes = {
    cpu:       document.getElementById('test-cpu'),
    memory:    document.getElementById('test-memory'),
    processes: document.getElementById('test-processes'),
    network:   document.getElementById('test-network'),
    disk:      document.getElementById('test-disk'),
    users:     document.getElementById('test-users'),
  };

  // Load saved test defaults
  (async () => {
    try {
      const defaults = await ipcRenderer.invoke('get-test-defaults');
      Object.entries(defaults).forEach(([key, val]) => {
        if (testCheckboxes[key]) testCheckboxes[key].checked = val;
      });
    } catch (e) { console.error('Failed to load test defaults:', e); }
  })();

  // Save test defaults when any checkbox changes
  Object.entries(testCheckboxes).forEach(([key, el]) => {
    if (el) el.addEventListener('change', async () => {
      const tests = {};
      Object.entries(testCheckboxes).forEach(([k, cb]) => { tests[k] = cb?.checked ?? true; });
      await ipcRenderer.invoke('set-test-defaults', tests);
    });
  });

  console.log('DOM elements retrieved');
  console.log('newSnapshotBtn:', !!newSnapshotBtn);
  console.log('snapshotList:', !!snapshotList);

  if (!newSnapshotBtn) {
    console.error('ERROR: Could not find newSnapshotBtn element!');
    console.error('Available elements:', Object.keys(document.body));
    return;
  }

  // Log any missing elements to help debug
  const elements = { deleteBtn, processSearch, compareBtn, compareSelect, uploadBtn, comparisonView, integrityInfo };
  Object.entries(elements).forEach(([name, el]) => {
    if (!el) console.error(`ERROR: Could not find element: ${name}`);
  });

  // Event Listeners
newSnapshotBtn.addEventListener('click', () => {
  const now = new Date();

  // Replaced colons with hyphens and the space with an underscore
  const formatted =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0') + '-' +
    String(now.getSeconds()).padStart(2, '0');

  const name = snapshotNameInput.value.trim() || "snapshot_" + formatted;

  // Read which categories are selected
  const tests = {
    cpu:       testCheckboxes.cpu?.checked       ?? true,
    memory:    testCheckboxes.memory?.checked    ?? true,
    processes: testCheckboxes.processes?.checked ?? true,
    network:   testCheckboxes.network?.checked   ?? true,
    disk:      testCheckboxes.disk?.checked      ?? true,
    users:     testCheckboxes.users?.checked     ?? true,
  };

  // Require at least one test to be selected
  if (!Object.values(tests).some(Boolean)) {
    alert('Please select at least one category to include in the snapshot.');
    return;
  }

  takeNewSnapshot(name, tests);
  snapshotNameInput.value = '';
});

  if (deleteBtn) deleteBtn.addEventListener('click', () => {
    if (currentSnapshot) {
      deleteSnapshot(currentSnapshot);
    }
  });

  if (processSearch) processSearch.addEventListener('input', (e) => {
    filterProcesses(e.target.value.toLowerCase());
  });

  if (compareBtn) compareBtn.addEventListener('click', () => {
    const selectedSnapshot = compareSelect.value;
    if (selectedSnapshot) {
      performComparison(currentSnapshot, selectedSnapshot);
    }
  });

  if (pinBtn) pinBtn.addEventListener('click', async () => {
    if (!currentSnapshot) return;
    try {
      const data = await ipcRenderer.invoke('load-snapshot', currentSnapshot);
      const isPinned = data?.metadata?.pinned === true;
      const result = await ipcRenderer.invoke('set-snapshot-pinned', currentSnapshot, !isPinned);
      if (result) {
        pinBtn.textContent = !isPinned ? '📌 Unpin' : '📌 Pin';
        pinBtn.className = !isPinned ? 'btn btn-pin pinned' : 'btn btn-pin';
        renderSnapshotList();
      }
    } catch (e) {
      console.error('Error toggling pin:', e);
    }
  });

  if (uploadBtn) uploadBtn.addEventListener('click', async () => {
    if (!currentSnapshot) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading...';
    try {
      const result = await ipcRenderer.invoke('upload-snapshot', currentSnapshot);
      if (result.success) {
        uploadBtn.textContent = '✅ Uploaded!';
        setTimeout(() => { uploadBtn.textContent = '☁️ Upload'; uploadBtn.disabled = false; }, 2000);
      } else {
        alert(`Upload failed: ${result.error}`);
        uploadBtn.textContent = '☁️ Upload';
        uploadBtn.disabled = false;
      }
    } catch (e) {
      alert(`Upload error: ${e.message}`);
      uploadBtn.textContent = '☁️ Upload';
      uploadBtn.disabled = false;
    }
  });

  if (compareSelect) compareSelect.addEventListener('change', (e) => {
    // Button is always visible - no hide/show logic needed
  });

  // --- Max snapshots setting ---
  const maxSnapshotsInput = document.getElementById('maxSnapshotsInput');

  // Load saved max-snapshots value
  (async () => {
    try {
      const max = await ipcRenderer.invoke('get-max-snapshots');
      maxSnapshotsInput.value = max;
    } catch (e) { console.error('Failed to load max-snapshots:', e); }
  })();

  maxSnapshotsInput.addEventListener('change', async () => {
    let val = parseInt(maxSnapshotsInput.value, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 9999) val = 9999;
    maxSnapshotsInput.value = val;
    await ipcRenderer.invoke('set-max-snapshots', val);
  });

  console.log('Event listeners attached');

  // --- Data folder ---
  const dataFolderPath = document.getElementById('dataFolderPath');
  const openDataFolderBtn = document.getElementById('openDataFolderBtn');
  const moveDataFolderBtn = document.getElementById('moveDataFolderBtn');
  const resetDataFolderBtn = document.getElementById('resetDataFolderBtn');

  async function refreshDataFolderPath() {
    try {
      const p = await ipcRenderer.invoke('get-data-folder');
      dataFolderPath.textContent = p;
    } catch (e) { dataFolderPath.textContent = 'Unknown'; }
  }
  refreshDataFolderPath();

  openDataFolderBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('open-data-folder');
  });

  moveDataFolderBtn.addEventListener('click', async () => {
    moveDataFolderBtn.disabled = true;
    moveDataFolderBtn.textContent = '⏳ Moving...';
    try {
      const result = await ipcRenderer.invoke('move-data-folder');
      if (result.success) {
        await refreshDataFolderPath();
        await loadSnapshotList();
      } else if (!result.canceled) {
        alert(`Failed to move data folder: ${result.error}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      moveDataFolderBtn.disabled = false;
      moveDataFolderBtn.textContent = '📁 Move';
    }
  });

  resetDataFolderBtn.addEventListener('click', async () => {
    if (!confirm('Reset data folder to the default location? Existing files in the custom folder will NOT be moved back.')) return;
    try {
      const result = await ipcRenderer.invoke('reset-data-folder');
      if (result.success) {
        await refreshDataFolderPath();
        await loadSnapshotList();
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  });

  // --- Settings panel ---
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const autoSnapshotToggle = document.getElementById('autoSnapshotToggle');
  const autoSnapshotIntervalInput = document.getElementById('autoSnapshotInterval');
  const autoSnapshotStatus = document.getElementById('autoSnapshotStatus');

  function updateStatusText(enabled, minutes) {
    autoSnapshotStatus.textContent = enabled
      ? `Auto-snapshots: On (every ${minutes} min)`
      : 'Auto-snapshots: Off';
    autoSnapshotStatus.className = 'setting-status ' + (enabled ? 'status-on' : '');
  }

  // Load current settings from main process
  (async () => {
    try {
      const settings = await ipcRenderer.invoke('get-auto-snapshot-settings');
      autoSnapshotToggle.checked = settings.enabled;
      autoSnapshotIntervalInput.value = settings.minutes;
      updateStatusText(settings.enabled, settings.minutes);
    } catch (e) { console.error('Failed to load settings:', e); }
  })();

  settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = 'none';
  });

  autoSnapshotToggle.addEventListener('change', async () => {
    const enabled = autoSnapshotToggle.checked;
    const minutes = parseInt(autoSnapshotIntervalInput.value, 10) || 5;
    if (enabled) {
      await ipcRenderer.invoke('start-auto-snapshot', minutes);
    } else {
      await ipcRenderer.invoke('stop-auto-snapshot');
    }
    updateStatusText(enabled, minutes);
  });

  autoSnapshotIntervalInput.addEventListener('change', async () => {
    let minutes = parseInt(autoSnapshotIntervalInput.value, 10);
    if (!minutes || minutes < 1) minutes = 1;
    if (minutes > 1440) minutes = 1440;
    autoSnapshotIntervalInput.value = minutes;
    await ipcRenderer.invoke('set-auto-snapshot-interval', minutes);
    if (autoSnapshotToggle.checked) {
      updateStatusText(true, minutes);
    }
  });

  // Refresh list when an auto-snapshot is taken
  ipcRenderer.on('snapshot-taken', () => {
    loadSnapshotList();
  });

  // --- Sidebar Tabs ---
  const tabSnapshots = document.getElementById('tabSnapshots');
  const tabDeltas = document.getElementById('tabDeltas');
  const snapshotsPanel = document.getElementById('snapshotsPanel');
  const deltasPanel = document.getElementById('deltasPanel');

  tabSnapshots.addEventListener('click', () => {
    activeTab = 'snapshots';
    tabSnapshots.classList.add('active');
    tabDeltas.classList.remove('active');
    snapshotsPanel.style.display = '';
    deltasPanel.style.display = 'none';
  });

  tabDeltas.addEventListener('click', () => {
    activeTab = 'deltas';
    tabDeltas.classList.add('active');
    tabSnapshots.classList.remove('active');
    deltasPanel.style.display = '';
    snapshotsPanel.style.display = 'none';
    loadDeltaList();
    populateDeltaDropdowns();
  });

  // --- Delta creation ---
  const deltaBeforeSelect = document.getElementById('deltaBeforeSelect');
  const deltaAfterSelect = document.getElementById('deltaAfterSelect');
  const createDeltaBtn = document.getElementById('createDeltaBtn');
  const deleteDeltaBtn = document.getElementById('deleteDeltaBtn');

  const deltaCatCheckboxes = {
    cpu:       document.getElementById('delta-cpu'),
    memory:    document.getElementById('delta-memory'),
    processes: document.getElementById('delta-processes'),
    network:   document.getElementById('delta-network'),
    disk:      document.getElementById('delta-disk'),
    users:     document.getElementById('delta-users'),
  };

  createDeltaBtn.addEventListener('click', async () => {
    const beforeName = deltaBeforeSelect.value;
    const afterName = deltaAfterSelect.value;
    if (!beforeName || !afterName) { alert('Please select both a Before and After snapshot.'); return; }
    if (beforeName === afterName) { alert('Before and After must be different snapshots.'); return; }

    const cats = {};
    Object.entries(deltaCatCheckboxes).forEach(([k, cb]) => { cats[k] = cb?.checked ?? true; });
    if (!Object.values(cats).some(Boolean)) { alert('Select at least one category.'); return; }

    createDeltaBtn.disabled = true;
    createDeltaBtn.textContent = '⏳ Creating...';
    try {
      const result = await ipcRenderer.invoke('create-delta', beforeName, afterName, cats);
      if (result.success) {
        await loadDeltaList();
        await loadDelta(result.name);
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      createDeltaBtn.disabled = false;
      createDeltaBtn.textContent = '📐 Create Delta';
    }
  });

  deleteDeltaBtn.addEventListener('click', async () => {
    if (!currentDelta) return;
    if (!confirm(`Delete delta "${currentDelta}"?`)) return;
    try {
      await ipcRenderer.invoke('delete-delta', currentDelta);
      currentDelta = null;
      await loadDeltaList();
      document.getElementById('deltaDetail').style.display = 'none';
      document.getElementById('deltaGraphView').style.display = 'none';
      emptyState.style.display = 'flex';
    } catch (e) { console.error('Error deleting delta:', e); }
  });

  // --- Delta date filter ---
  const deltaFilterFrom = document.getElementById('deltaFilterFrom');
  const deltaFilterTo = document.getElementById('deltaFilterTo');
  const deltaFilterClearBtn = document.getElementById('deltaFilterClearBtn');

  deltaFilterFrom.addEventListener('change', () => { renderDeltaList(); });
  deltaFilterTo.addEventListener('change', () => { renderDeltaList(); });
  deltaFilterClearBtn.addEventListener('click', () => {
    deltaFilterFrom.value = '';
    deltaFilterTo.value = '';
    renderDeltaList();
  });

  // --- Snapshot graph controls ---
  const graphFilterFrom = document.getElementById('graphFilterFrom');
  const graphFilterTo = document.getElementById('graphFilterTo');
  const graphFilterClearBtn = document.getElementById('graphFilterClearBtn');
  const snapshotGraphBtn = document.getElementById('snapshotGraphBtn');

  graphFilterFrom.addEventListener('change', updateSnapshotGraphBtn);
  graphFilterTo.addEventListener('change', updateSnapshotGraphBtn);
  graphFilterClearBtn.addEventListener('click', () => {
    graphFilterFrom.value = '';
    graphFilterTo.value = '';
    updateSnapshotGraphBtn();
  });

  async function updateSnapshotGraphBtn() {
    const snapshots = await getFilteredSnapshots();
    snapshotGraphBtn.disabled = snapshots.length < 2;
    snapshotGraphBtn.textContent = snapshots.length >= 2
      ? `📊 Graph ${snapshots.length} Snapshots`
      : '📊 Graph Snapshots';
  }

  snapshotGraphBtn.addEventListener('click', async () => {
    const snapshots = await getFilteredSnapshots();
    if (snapshots.length < 2) { alert('Need at least 2 snapshots in the selected period to generate graphs.'); return; }
    showSnapshotGraphs(snapshots);
  });

  // Close graph view
  document.getElementById('closeGraphBtn').addEventListener('click', () => {
    document.getElementById('deltaGraphView').style.display = 'none';
    emptyState.style.display = 'flex';
  });

  // Load snapshots on startup
  console.log('Loading snapshot list...');
  loadSnapshotList();
}

// Load all saved snapshots
async function loadSnapshotList() {
  try {
    allSnapshots = await ipcRenderer.invoke('list-snapshots');
    await renderSnapshotList();
    if (allSnapshots.length === 0) {
      snapshotList.innerHTML = '<p class="loading">No snapshots yet</p>';
    }
  } catch (e) {
    console.error('Error loading snapshots:', e);
  }
}

// Render snapshot list in sidebar
async function renderSnapshotList() {
  snapshotList.innerHTML = '';
  for (const name of allSnapshots) {
    const item = document.createElement('div');
    item.className = `snapshot-item ${name === currentSnapshot ? 'active' : ''}`;

    // Check if pinned
    let isPinned = false;
    try {
      const data = await ipcRenderer.invoke('load-snapshot', name);
      isPinned = data?.metadata?.pinned === true;
    } catch (e) { /* ignore */ }

    item.innerHTML = `${isPinned ? '<span class="pin-indicator">📌</span> ' : ''}${name}`;
    if (isPinned) item.classList.add('pinned');
    item.addEventListener('click', () => loadSnapshot(name));
    snapshotList.appendChild(item);
  }
  
  // Update comparison dropdown
  compareSelect.innerHTML = '<option value="">Compare with...</option>';
  allSnapshots.forEach((name) => {
    if (name !== currentSnapshot) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      compareSelect.appendChild(option);
    }
  });
  
  compareSelect.value = '';
}

// Load and display a snapshot
async function loadSnapshot(name) {
  try {
    const data = await ipcRenderer.invoke('load-snapshot', name);
    if (data) {
      currentSnapshot = name;
      displaySnapshot(data);
      await renderSnapshotList();
      
      // Reset the compare dropdown and hide button when loading new snapshot
      compareSelect.value = '';
      compareSelect.focus(); // Auto-focus dropdown
    }
  } catch (e) {
    console.error('Error loading snapshot:', e);
  }
}

// Display snapshot data in main view
function displaySnapshot(data) {
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'flex';
  comparisonView.style.display = 'none';
  document.getElementById('deltaDetail').style.display = 'none';
  document.getElementById('deltaGraphView').style.display = 'none';

  detailTitle.textContent = currentSnapshot;
  detailTimestamp.textContent = new Date(data.metadata.timestamp).toLocaleString();

  // Update pin button state
  const pinBtnEl = document.getElementById('pinBtn');
  if (pinBtnEl) {
    const isPinned = data?.metadata?.pinned === true;
    pinBtnEl.textContent = isPinned ? '📌 Unpin' : '📌 Pin';
    pinBtnEl.className = isPinned ? 'btn btn-pin pinned' : 'btn btn-pin';
  }

  // Display integrity information
  if (data.integrity) {
    integrityInfo.innerHTML = `
      ✓ Verified | SHA256: ${data.integrity.sha256_checksum.substring(0, 16)}... | 
      Signed: ${new Date(data.integrity.signed_at).toLocaleString()}
    `;
  }

  // Display which tests were run as badges
  const badgesEl = document.getElementById('testsRunBadges');
  if (badgesEl) {
    const run = data.metadata?.tests_run;
    if (run) {
      const labels = { cpu: '💻 CPU & OS', memory: '🧠 Memory', processes: '⚙️ Processes', network: '🌐 Network', disk: '💾 Disk', users: '👤 Users' };
      badgesEl.innerHTML = Object.entries(labels).map(([key, label]) =>
        `<span class="test-badge ${run[key] ? 'badge-on' : 'badge-off'}">${label}</span>`
      ).join('');
    } else {
      // Older snapshot captured before tests_run metadata existed — assume all ran
      badgesEl.innerHTML = '<span class="test-badge badge-on">All categories</span>';
    }
  }

  // System info
  const run = data.metadata?.tests_run || {};

  // Hide/show individual system info items based on collected categories
  const cpuManufacturerItem = document.getElementById('cpuManufacturer').closest('.info-item');
  const cpuBrandItem = document.getElementById('cpuBrand').closest('.info-item');
  const cpuCoresItem = document.getElementById('cpuCores').closest('.info-item');
  const totalMemoryItem = document.getElementById('totalMemory').closest('.info-item');
  const osInfoItem = document.getElementById('osInfo').closest('.info-item');
  const diskInfoItem = document.getElementById('diskInfo').closest('.info-item');

  cpuManufacturerItem.style.display = run.cpu === false ? 'none' : '';
  cpuBrandItem.style.display = run.cpu === false ? 'none' : '';
  cpuCoresItem.style.display = run.cpu === false ? 'none' : '';
  osInfoItem.style.display = run.cpu === false ? 'none' : '';
  totalMemoryItem.style.display = run.memory === false ? 'none' : '';
  diskInfoItem.style.display = run.disk === false ? 'none' : '';

  // Hide the entire System Information section if all contributing categories are off
  const systemSection = document.querySelector('.system-info');
  systemSection.style.display = (run.cpu === false && run.memory === false && run.disk === false) ? 'none' : '';

  document.getElementById('cpuManufacturer').textContent = data.system.cpu_manufacturer || 'N/A';
  document.getElementById('cpuBrand').textContent = data.system.cpu_brand || 'N/A';
  document.getElementById('cpuCores').textContent = data.system.cpu_cores || 'N/A';
  document.getElementById('totalMemory').textContent = `${data.system.total_memory_gb} GB (${data.system.used_memory_gb} GB used)`;
  document.getElementById('osInfo').textContent = `${data.system.os_distro || 'N/A'} (${data.system.os_release || 'N/A'})`;
  const diskIOArr = data.system.disk_io || [];
  if (diskIOArr.length > 0) {
    const totalRead = diskIOArr.reduce((s, d) => s + (d.read_bytes_per_sec || 0), 0);
    const totalWrite = diskIOArr.reduce((s, d) => s + (d.write_bytes_per_sec || 0), 0);
    document.getElementById('diskInfo').textContent = `R: ${formatBytes(totalRead)}/s  W: ${formatBytes(totalWrite)}/s`;
  } else {
    document.getElementById('diskInfo').textContent = 'N/A';
  }

  // Network section - hide entirely if not collected
  const networkSection = document.querySelector('.network-section');
  networkSection.style.display = run.network === false ? 'none' : '';

  // Network Interfaces
  const networkInterfaces = document.getElementById('networkInterfaces');
  networkInterfaces.innerHTML = '';
  if (run.network === false) {
    // section is hidden, no need to populate
  } else if (data.network && data.network.interfaces) {
    data.network.interfaces.slice(0, 5).forEach(iface => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${iface.iface}</strong>: ${iface.ip4 || 'N/A'} (${iface.type || 'N/A'})`;
      networkInterfaces.appendChild(item);
    });
  }

  // Listening Ports
  const listeningPorts = document.getElementById('listeningPorts');
  listeningPorts.innerHTML = '';
  if (run.network === false) {
    // section is hidden, no need to populate
  } else if (data.network && data.network.listening_ports) {
    data.network.listening_ports.slice(0, 10).forEach(port => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${port.process_name || 'Unknown'}</strong>: ${port.protocol.toUpperCase()} ${port.local_port}`;
      listeningPorts.appendChild(item);
    });
  }

  // File System section - hide entirely if not collected
  const filesystemSection = document.querySelector('.filesystem-section');
  filesystemSection.style.display = run.disk === false ? 'none' : '';

  const filesystemInfo = document.getElementById('filesystemInfo');
  filesystemInfo.innerHTML = '';
  if (run.disk === false) {
    // section is hidden, no need to populate
  } else if (data.system && data.system.disk_io) {
    data.system.disk_io.forEach(d => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${d.name}</strong>: Read ${formatBytes(d.read_bytes_per_sec)}/s | Write ${formatBytes(d.write_bytes_per_sec)}/s | ${d.reads_per_sec} reads/s | ${d.writes_per_sec} writes/s`;
      filesystemInfo.appendChild(item);
    });
  }

  // Processes section - hide entirely if not collected
  const processesSection = document.querySelector('.processes-section');
  processesSection.style.display = run.processes === false ? 'none' : '';

  if (run.processes !== false) {
    renderProcesses(data.running_processes);
  }

  // Users section - hide entirely if not collected
  const usersSection = document.querySelector('.users-section');
  usersSection.style.display = run.users === false ? 'none' : '';

  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';
  if (run.users !== false && data.users && data.users.length > 0) {
    data.users.forEach(u => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${u.user}</strong> — tty: ${u.tty || 'N/A'} | logged in: ${u.date || ''} ${u.time || ''}`;
      usersList.appendChild(item);
    });
  } else if (run.users !== false) {
    usersList.innerHTML = '<p style="color: #999; font-size: 13px;">No users found</p>';
  }
}

// Render processes list
function renderProcesses(processes) {
  processList.innerHTML = '';
  processes.forEach((proc) => {
    const item = document.createElement('div');
    item.className = 'process-item';
    item.innerHTML = `
      <span class="process-name">${proc.name}</span>
      <span class="process-pid">PID: ${proc.pid}</span>
      <div class="process-stats">
        <div class="stat">
          <span class="stat-label">CPU</span>
          <span class="stat-value">${(proc.cpu_usage || 0).toFixed(2)}%</span>
        </div>
        <div class="stat">
          <span class="stat-label">Memory</span>
          <span class="stat-value">${(proc.mem_usage || 0).toFixed(2)}%</span>
        </div>
      </div>
    `;
    processList.appendChild(item);
  });
}

// Filter processes by search
function filterProcesses(query) {
  const items = processList.querySelectorAll('.process-item');
  items.forEach((item) => {
    const name = item.querySelector('.process-name').textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

// Take a new snapshot
async function takeNewSnapshot(name, tests = {}) {
  if (!ipcRenderer) {
    console.error('ipcRenderer not available!');
    alert('IPC not available. Please check console.');
    return;
  }
  
  newSnapshotBtn.disabled = true;
  newSnapshotBtn.textContent = '⏳ Taking snapshot...';
  
  try {
    const data = await ipcRenderer.invoke('take-snapshot', name, tests);
    if (data) {
      await loadSnapshotList();
      await loadSnapshot(name);
    }
  } catch (e) {
    console.error('Error taking snapshot:', e);
    alert('Error taking snapshot. Check console for details.');
  } finally {
    newSnapshotBtn.disabled = false;
    newSnapshotBtn.textContent = '📷 Take Snapshot';
  }
}

// Delete a snapshot
async function deleteSnapshot(name) {
  if (confirm(`Are you sure you want to delete "${name}"?`)) {
    try {
      const success = await ipcRenderer.invoke('delete-snapshot', name);
      if (success) {
        currentSnapshot = null;
        await loadSnapshotList();
        emptyState.style.display = 'flex';
        snapshotDetail.style.display = 'none';
      }
    } catch (e) {
      console.error('Error deleting snapshot:', e);
    }
  }
}

// Perform comparison between two snapshots
async function performComparison(baselineName, afterName) {
  if (!ipcRenderer) {
    console.error('ipcRenderer not available!');
    return;
  }

  console.log(`Comparing ${baselineName} with ${afterName}...`);
  
  try {
    // Warn if the two snapshots collected different categories
    const [baselineData, afterData] = await Promise.all([
      ipcRenderer.invoke('load-snapshot', baselineName),
      ipcRenderer.invoke('load-snapshot', afterName),
    ]);

    const baselineRun = baselineData?.metadata?.tests_run;
    const afterRun = afterData?.metadata?.tests_run;
    if (baselineRun && afterRun) {
      const mismatched = Object.keys(baselineRun).filter(k => baselineRun[k] !== afterRun[k]);
      if (mismatched.length > 0) {
        const labels = { cpu: 'CPU & OS', memory: 'Memory', processes: 'Processes', network: 'Network', disk: 'Disk', users: 'Users' };
        const names = mismatched.map(k => labels[k] || k).join(', ');
        alert(`⚠️ Warning: These snapshots collected different categories (${names}). Comparison results may be incomplete or misleading.`);
      }
    }

    const comparison = await ipcRenderer.invoke('compare-snapshots', baselineName, afterName);
    
    if (comparison) {
      displayComparison(comparison);
    }
  } catch (e) {
    console.error('Error comparing snapshots:', e);
    alert('Error comparing snapshots. Check console for details.');
  }
}

// Display comparison results
function displayComparison(comparison) {
  comparisonView.style.display = 'block';
  document.getElementById('deltaDetail').style.display = 'none';
  document.getElementById('deltaGraphView').style.display = 'none';
  
  // New Processes
  const newProcessesList = document.getElementById('newProcessesList');
  newProcessesList.innerHTML = '';
  if (comparison.new_processes.length > 0) {
    comparison.new_processes.forEach(proc => {
      const item = document.createElement('div');
      item.className = 'comparison-item warning';
      item.innerHTML = `
        <strong>${proc.name}</strong> (PID: ${proc.pid})<br/>
        CPU: ${proc.cpu_usage.toFixed(2)}% | Memory: ${proc.mem_usage.toFixed(2)}%
      `;
      newProcessesList.appendChild(item);
    });
  } else {
    newProcessesList.innerHTML = '<p style="color: #999; font-size: 12px;">No new processes</p>';
  }

  // Removed Processes
  const removedProcessesList = document.getElementById('removedProcessesList');
  removedProcessesList.innerHTML = '';
  if (comparison.removed_processes.length > 0) {
    comparison.removed_processes.forEach(proc => {
      const item = document.createElement('div');
      item.className = 'comparison-item danger';
      item.innerHTML = `<strong>${proc.name}</strong> (PID: ${proc.pid})`;
      removedProcessesList.appendChild(item);
    });
  } else {
    removedProcessesList.innerHTML = '<p style="color: #999; font-size: 12px;">No removed processes</p>';
  }

  // Process Changes
  const processChangesList = document.getElementById('processChangesList');
  processChangesList.innerHTML = '';
  const significantChanges = comparison.process_changes
    .sort((a, b) => Math.abs(b.cpu_change) - Math.abs(a.cpu_change))
    .slice(0, 10);
  
  if (significantChanges.length > 0) {
    significantChanges.forEach(change => {
      const item = document.createElement('div');
      item.className = 'comparison-item ' + (Math.abs(change.cpu_change) > 2 ? 'warning' : '');
      item.innerHTML = `
        <strong>${change.name}</strong><br/>
        CPU: ${change.cpu_before.toFixed(2)}% → ${change.cpu_after.toFixed(2)}% 
        (${change.cpu_change > 0 ? '+' : ''}${change.cpu_change.toFixed(2)}%)<br/>
        Memory: ${change.mem_before.toFixed(2)}% → ${change.mem_after.toFixed(2)}% 
        (${change.mem_change > 0 ? '+' : ''}${change.mem_change.toFixed(2)}%)
      `;
      processChangesList.appendChild(item);
    });
  } else {
    processChangesList.innerHTML = '<p style="color: #999; font-size: 12px;">No significant changes</p>';
  }

  // New Listening Ports
  const newPortsList = document.getElementById('newPortsList');
  newPortsList.innerHTML = '';
  if (comparison.new_listening_ports.length > 0) {
    comparison.new_listening_ports.slice(0, 10).forEach(port => {
      const item = document.createElement('div');
      item.className = 'comparison-item warning';
      item.innerHTML = `
        <strong>${port.process_name || 'Unknown'}</strong> (PID: ${port.pid})<br/>
        ${port.protocol.toUpperCase()} ${port.local_address}:${port.local_port}
      `;
      newPortsList.appendChild(item);
    });
    if (comparison.new_listening_ports.length > 10) {
      const item = document.createElement('div');
      item.style.padding = '8px';
      item.style.color = '#999';
      item.textContent = `...and ${comparison.new_listening_ports.length - 10} more`;
      newPortsList.appendChild(item);
    }
  } else {
    newPortsList.innerHTML = '<p style="color: #999; font-size: 12px;">No new listening ports</p>';
  }
}

// --- Delta functions ---

function populateDeltaDropdowns() {
  const deltaBeforeSelect = document.getElementById('deltaBeforeSelect');
  const deltaAfterSelect = document.getElementById('deltaAfterSelect');
  deltaBeforeSelect.innerHTML = '<option value="">Before snapshot...</option>';
  deltaAfterSelect.innerHTML = '<option value="">After snapshot...</option>';
  allSnapshots.forEach(name => {
    deltaBeforeSelect.innerHTML += `<option value="${name}">${name}</option>`;
    deltaAfterSelect.innerHTML += `<option value="${name}">${name}</option>`;
  });
}

async function loadDeltaList() {
  try {
    allDeltas = await ipcRenderer.invoke('list-deltas');
    renderDeltaList();
  } catch (e) { console.error('Error loading deltas:', e); }
}

function getFilteredDeltas() {
  const fromVal = document.getElementById('deltaFilterFrom')?.value;
  const toVal = document.getElementById('deltaFilterTo')?.value;
  let list = allDeltas;
  if (fromVal) {
    const from = new Date(fromVal);
    list = list.filter(d => !d.created_at || new Date(d.created_at) >= from);
  }
  if (toVal) {
    const to = new Date(toVal);
    list = list.filter(d => !d.created_at || new Date(d.created_at) <= to);
  }
  return list;
}

function renderDeltaList() {
  const deltaList = document.getElementById('deltaList');
  deltaList.innerHTML = '';
  const filtered = getFilteredDeltas();
  if (filtered.length === 0) {
    deltaList.innerHTML = '<p class="loading">No deltas found</p>';
    return;
  }
  filtered.forEach(entry => {
    const item = document.createElement('div');
    item.className = `snapshot-item ${entry.name === currentDelta ? 'active' : ''}`;
    // Show a friendlier label: parse "before_vs_after_date" into readable text
    const displayName = entry.name
      .replace(/_vs_/g, ' → ')
      .replace(/_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/, ' ($1/$2/$3 $4:$5)');
    item.textContent = displayName;
    item.title = entry.name;
    if (entry.created_at) {
      const sub = document.createElement('span');
      sub.className = 'delta-item-date';
      sub.textContent = new Date(entry.created_at).toLocaleDateString();
      item.appendChild(sub);
    }
    item.addEventListener('click', () => loadDelta(entry.name));
    deltaList.appendChild(item);
  });
}

async function loadDelta(name) {
  try {
    const data = await ipcRenderer.invoke('load-delta', name);
    if (data) {
      currentDelta = name;
      displayDelta(data);
      renderDeltaList();
    }
  } catch (e) { console.error('Error loading delta:', e); }
}

function signedNum(n) {
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (isNaN(v)) return 'N/A';
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = Math.abs(bytes);
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function signedBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '0 B';
  const sign = bytes >= 0 ? '+' : '-';
  return sign + formatBytes(Math.abs(bytes));
}

function displayDelta(data) {
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'none';
  document.getElementById('deltaGraphView').style.display = 'none';
  const deltaDetail = document.getElementById('deltaDetail');
  deltaDetail.style.display = 'flex';

  document.getElementById('deltaTitle').textContent = data.metadata.delta_name || currentDelta;
  document.getElementById('deltaTimestamp').textContent = `Created: ${new Date(data.metadata.created_at).toLocaleString()}`;
  document.getElementById('deltaSnapshots').textContent =
    `Before: ${data.metadata.before_snapshot}  →  After: ${data.metadata.after_snapshot}  (${data.metadata.time_diff_minutes} min apart)`;

  // Category badges
  const badgesEl = document.getElementById('deltaCategoriesBadges');
  const cats = data.metadata.categories_compared;
  const labels = { cpu: '💻 CPU & OS', memory: '🧠 Memory', processes: '⚙️ Processes', network: '🌐 Network', disk: '💾 Disk', users: '👤 Users' };
  badgesEl.innerHTML = Object.entries(labels).map(([key, lbl]) =>
    `<span class="test-badge ${cats[key] ? 'badge-on' : 'badge-off'}">${lbl}</span>`
  ).join('');

  // Build content
  const content = document.getElementById('deltaContent');
  content.innerHTML = '';

  // CPU
  if (data.cpu) {
    const section = document.createElement('section');
    section.innerHTML = `<h3>💻 CPU & OS Changes</h3>`;
    if (data.cpu.changes.length === 0) {
      section.innerHTML += '<p class="delta-no-change">No changes detected</p>';
    } else {
      data.cpu.changes.forEach(c => {
        section.innerHTML += `<div class="delta-change-item"><strong>${c.field}</strong>: ${c.before} → ${c.after}</div>`;
      });
    }
    content.appendChild(section);
  }

  // Memory
  if (data.memory) {
    const m = data.memory;
    const section = document.createElement('section');
    section.innerHTML = `
      <h3>🧠 Memory Delta</h3>
      <div class="delta-grid">
        <div class="delta-stat">
          <span class="delta-label">Used Memory</span>
          <span class="delta-value">${m.used_before_gb} GB → ${m.used_after_gb} GB</span>
          <span class="delta-diff ${m.used_change_gb > 0 ? 'diff-up' : m.used_change_gb < 0 ? 'diff-down' : ''}">${signedNum(m.used_change_gb)} GB</span>
        </div>
        <div class="delta-stat">
          <span class="delta-label">Usage %</span>
          <span class="delta-value">${m.used_percent_before}% → ${m.used_percent_after}%</span>
          <span class="delta-diff ${m.used_percent_after > m.used_percent_before ? 'diff-up' : m.used_percent_after < m.used_percent_before ? 'diff-down' : ''}">${signedNum(m.used_percent_after - m.used_percent_before)}%</span>
        </div>
        <div class="delta-stat">
          <span class="delta-label">Total Memory</span>
          <span class="delta-value">${m.total_before_gb} GB → ${m.total_after_gb} GB</span>
          <span class="delta-diff">${signedNum(m.total_change_gb)} GB</span>
        </div>
      </div>
    `;
    content.appendChild(section);
  }

  // Processes
  if (data.processes) {
    const p = data.processes;
    const section = document.createElement('section');
    section.innerHTML = `<h3>⚙️ Process Delta</h3>
      <p style="font-size:13px;color:#666;margin-bottom:10px;">Process count: ${p.count_before} → ${p.count_after} (${signedNum(p.count_change)})</p>`;

    if (p.new_processes.length > 0) {
      let html = '<h4 class="delta-subheader">🆕 New Processes</h4>';
      p.new_processes.slice(0, 20).forEach(proc => {
        html += `<div class="delta-change-item warning">${proc.name} — CPU: ${proc.cpu_usage.toFixed(2)}% | Mem: ${proc.mem_usage.toFixed(2)}%</div>`;
      });
      if (p.new_processes.length > 20) html += `<p style="color:#999;font-size:12px;">...and ${p.new_processes.length - 20} more</p>`;
      section.innerHTML += html;
    }

    if (p.removed_processes.length > 0) {
      let html = '<h4 class="delta-subheader">❌ Removed Processes</h4>';
      p.removed_processes.slice(0, 20).forEach(proc => {
        html += `<div class="delta-change-item danger">${proc.name}</div>`;
      });
      if (p.removed_processes.length > 20) html += `<p style="color:#999;font-size:12px;">...and ${p.removed_processes.length - 20} more</p>`;
      section.innerHTML += html;
    }

    if (p.changed_processes.length > 0) {
      let html = '<h4 class="delta-subheader">📈 Changed Processes</h4>';
      p.changed_processes.slice(0, 15).forEach(c => {
        html += `<div class="delta-change-item">
          <strong>${c.name}</strong><br/>
          CPU: ${c.cpu_before.toFixed(2)}% → ${c.cpu_after.toFixed(2)}% (${signedNum(c.cpu_change)}%)<br/>
          Mem: ${c.mem_before.toFixed(2)}% → ${c.mem_after.toFixed(2)}% (${signedNum(c.mem_change)}%)
        </div>`;
      });
      section.innerHTML += html;
    }

    if (p.new_processes.length === 0 && p.removed_processes.length === 0 && p.changed_processes.length === 0) {
      section.innerHTML += '<p class="delta-no-change">No significant process changes</p>';
    }
    content.appendChild(section);
  }

  // Network
  if (data.network) {
    const n = data.network;
    const section = document.createElement('section');
    section.innerHTML = `<h3>🌐 Network Delta</h3>
      <p style="font-size:13px;color:#666;margin-bottom:10px;">Ports: ${n.port_count_before} → ${n.port_count_after} | Interfaces: ${n.interface_count_before} → ${n.interface_count_after}</p>`;

    if (n.new_ports.length > 0) {
      let html = '<h4 class="delta-subheader">🆕 New Listening Ports</h4>';
      n.new_ports.slice(0, 15).forEach(p => {
        html += `<div class="delta-change-item warning">${p.process_name || 'Unknown'} — ${(p.protocol || '').toUpperCase()} ${p.local_port}</div>`;
      });
      section.innerHTML += html;
    }
    if (n.removed_ports.length > 0) {
      let html = '<h4 class="delta-subheader">❌ Removed Ports</h4>';
      n.removed_ports.slice(0, 15).forEach(p => {
        html += `<div class="delta-change-item danger">${p.process_name || 'Unknown'} — ${(p.protocol || '').toUpperCase()} ${p.local_port}</div>`;
      });
      section.innerHTML += html;
    }
    if (n.new_interfaces.length > 0) {
      let html = '<h4 class="delta-subheader">🆕 New Interfaces</h4>';
      n.new_interfaces.forEach(i => {
        html += `<div class="delta-change-item warning">${i.iface} — ${i.ip4 || 'N/A'}</div>`;
      });
      section.innerHTML += html;
    }
    if (n.removed_interfaces.length > 0) {
      let html = '<h4 class="delta-subheader">❌ Removed Interfaces</h4>';
      n.removed_interfaces.forEach(i => {
        html += `<div class="delta-change-item danger">${i.iface} — ${i.ip4 || 'N/A'}</div>`;
      });
      section.innerHTML += html;
    }
    if (n.new_ports.length === 0 && n.removed_ports.length === 0 && n.new_interfaces.length === 0 && n.removed_interfaces.length === 0) {
      section.innerHTML += '<p class="delta-no-change">No network changes</p>';
    }
    content.appendChild(section);
  }

  // Disk I/O
  if (data.disk) {
    const d = data.disk;
    const section = document.createElement('section');
    section.innerHTML = `<h3>💾 Disk I/O Delta</h3>`;

    if (d.drives && d.drives.length > 0) {
      d.drives.forEach(dr => {
        const readDiff = dr.read_bytes_per_sec_after - dr.read_bytes_per_sec_before;
        const writeDiff = dr.write_bytes_per_sec_after - dr.write_bytes_per_sec_before;
        section.innerHTML += `<div class="delta-change-item"><strong>${dr.name}</strong>: Read ${formatBytes(dr.read_bytes_per_sec_before)}/s → ${formatBytes(dr.read_bytes_per_sec_after)}/s (${signedBytes(readDiff)}/s) | Write ${formatBytes(dr.write_bytes_per_sec_before)}/s → ${formatBytes(dr.write_bytes_per_sec_after)}/s (${signedBytes(writeDiff)}/s)</div>`;
      });
    } else {
      section.innerHTML += '<p class="delta-no-change">No disk I/O data</p>';
    }
    content.appendChild(section);
  }

  // Users
  if (data.users) {
    const u = data.users;
    const section = document.createElement('section');
    section.innerHTML = `<h3>👤 Users Delta</h3>
      <p style="font-size:13px;color:#666;margin-bottom:10px;">Count: ${u.count_before} → ${u.count_after}</p>`;
    if (u.new_users.length > 0) {
      u.new_users.forEach(usr => {
        section.innerHTML += `<div class="delta-change-item warning">🆕 ${usr.user}</div>`;
      });
    }
    if (u.removed_users.length > 0) {
      u.removed_users.forEach(usr => {
        section.innerHTML += `<div class="delta-change-item danger">❌ ${usr.user}</div>`;
      });
    }
    if (u.new_users.length === 0 && u.removed_users.length === 0) {
      section.innerHTML += '<p class="delta-no-change">No user changes</p>';
    }
    content.appendChild(section);
  }
}

// --- Graph rendering ---
let activeCharts = [];

function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
}

async function getFilteredSnapshots() {
  const fromVal = document.getElementById('graphFilterFrom')?.value;
  const toVal = document.getElementById('graphFilterTo')?.value;
  let list = await ipcRenderer.invoke('list-snapshots-with-timestamps');
  if (fromVal) {
    const from = new Date(fromVal);
    list = list.filter(s => !s.timestamp || new Date(s.timestamp) >= from);
  }
  if (toVal) {
    const to = new Date(toVal);
    list = list.filter(s => !s.timestamp || new Date(s.timestamp) <= to);
  }
  return list;
}

async function showSnapshotGraphs(snapshotEntries) {
  // Load all snapshot data
  const snapshots = [];
  for (const entry of snapshotEntries) {
    try {
      const data = await ipcRenderer.invoke('load-snapshot', entry.name);
      if (data) snapshots.push({ name: entry.name, data });
    } catch (e) { /* skip */ }
  }

  snapshots.sort((a, b) => new Date(a.data.metadata.timestamp) - new Date(b.data.metadata.timestamp));

  if (snapshots.length < 2) { alert('Not enough snapshot data to graph.'); return; }

  // Hide other views
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'none';
  document.getElementById('deltaDetail').style.display = 'none';
  const graphView = document.getElementById('deltaGraphView');
  graphView.style.display = 'flex';

  const fromDate = new Date(snapshots[0].data.metadata.timestamp).toLocaleString();
  const toDate = new Date(snapshots[snapshots.length - 1].data.metadata.timestamp).toLocaleString();
  document.getElementById('graphPeriodLabel').textContent = `${snapshots.length} snapshots from ${fromDate} to ${toDate}`;

  destroyCharts();

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { ticks: { maxRotation: 45, font: { size: 10 } } },
      y: { beginAtZero: false }
    }
  };

  const makeLabel = (ts) => {
    const t = new Date(ts);
    return t.toLocaleDateString() + ' ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Memory chart
  const memCanvas = document.getElementById('memoryChart');
  const memSection = memCanvas.closest('section');
  const memData = snapshots.filter(s => s.data.system?.used_memory_gb != null);
  if (memData.length >= 2) {
    memSection.style.display = '';
    activeCharts.push(new Chart(memCanvas, {
      type: 'line',
      data: {
        labels: memData.map(s => makeLabel(s.data.metadata.timestamp)),
        datasets: [
          { label: 'Used Memory (GB)', data: memData.map(s => parseFloat(s.data.system.used_memory_gb) || 0), borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)', fill: true, tension: 0.3 },
          { label: 'Total Memory (GB)', data: memData.map(s => parseFloat(s.data.system.total_memory_gb) || 0), borderColor: '#1e88e5', borderDash: [5, 5], fill: false, tension: 0.3 },
        ]
      },
      options: chartOpts
    }));
  } else { memSection.style.display = 'none'; }

  // Process chart
  const procCanvas = document.getElementById('processChart');
  const procSection = procCanvas.closest('section');
  const procData = snapshots.filter(s => s.data.running_processes);
  if (procData.length >= 2) {
    procSection.style.display = '';
    activeCharts.push(new Chart(procCanvas, {
      type: 'line',
      data: {
        labels: procData.map(s => makeLabel(s.data.metadata.timestamp)),
        datasets: [
          { label: 'Process Count', data: procData.map(s => s.data.running_processes.length), borderColor: '#43a047', backgroundColor: 'rgba(67,160,71,0.1)', fill: true, tension: 0.3 },
        ]
      },
      options: chartOpts
    }));
  } else { procSection.style.display = 'none'; }

  // Network chart
  const netCanvas = document.getElementById('networkChart');
  const netSection = netCanvas.closest('section');
  const netData = snapshots.filter(s => s.data.network?.listening_ports);
  if (netData.length >= 2) {
    netSection.style.display = '';
    activeCharts.push(new Chart(netCanvas, {
      type: 'line',
      data: {
        labels: netData.map(s => makeLabel(s.data.metadata.timestamp)),
        datasets: [
          { label: 'Listening Ports', data: netData.map(s => s.data.network.listening_ports.length), borderColor: '#7b1fa2', backgroundColor: 'rgba(123,31,162,0.1)', fill: true, tension: 0.3 },
          { label: 'Interfaces', data: netData.map(s => (s.data.network.interfaces || []).length), borderColor: '#0097a7', fill: false, tension: 0.3 },
        ]
      },
      options: chartOpts
    }));
  } else { netSection.style.display = 'none'; }

  // Disk I/O chart
  const diskCanvas = document.getElementById('diskChart');
  const diskSection = diskCanvas.closest('section');
  const diskData = snapshots.filter(s => s.data.system?.disk_io && s.data.system.disk_io.length > 0);
  if (diskData.length >= 2) {
    diskSection.style.display = '';
    activeCharts.push(new Chart(diskCanvas, {
      type: 'line',
      data: {
        labels: diskData.map(s => makeLabel(s.data.metadata.timestamp)),
        datasets: [
          { label: 'Read (B/s)', data: diskData.map(s => s.data.system.disk_io.reduce((t, d) => t + (d.read_bytes_per_sec || 0), 0)), borderColor: '#00897b', backgroundColor: 'rgba(0,137,123,0.1)', fill: true, tension: 0.3 },
          { label: 'Write (B/s)', data: diskData.map(s => s.data.system.disk_io.reduce((t, d) => t + (d.write_bytes_per_sec || 0), 0)), borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)', fill: true, tension: 0.3 },
        ]
      },
      options: chartOpts
    }));
  } else { diskSection.style.display = 'none'; }
}
