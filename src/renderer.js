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

// DOM Elements
let newSnapshotBtn, snapshotNameInput, snapshotList, emptyState, snapshotDetail;
let detailTitle, detailTimestamp, deleteBtn, processSearch, processList;
let compareSelect, compareBtn, comparisonView, integrityInfo, uploadBtn;

// Build the UI programmatically if HTML isn't present
function buildUI() {
  const htmlString = `
    <div class="container">
      <header>
        <h1> System Snapshot Viewer</h1>
        <p class="subtitle">View and manage system snapshots</p>
        <div class="header-row">
          <button id="settingsBtn" class="btn btn-settings" title="Settings"></button>
        </div>
      </header>

      <div id="settingsPanel" class="settings-panel" style="display: none;">
        <div class="settings-content">
          <div class="settings-header">
            <h3>Settings</h3>
            <button id="closeSettingsBtn" class="btn btn-close-settings">X</button>
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
                <label class="test-option"><input type="checkbox" id="test-cpu"       checked>  CPU &amp; OS</label>
                <label class="test-option"><input type="checkbox" id="test-memory"    checked>  Memory</label>
                <label class="test-option"><input type="checkbox" id="test-processes" checked>  Processes</label>
                <label class="test-option"><input type="checkbox" id="test-network"   checked>  Network</label>
                <label class="test-option"><input type="checkbox" id="test-disk"      checked>  Disk &amp; FS</label>
                <label class="test-option"><input type="checkbox" id="test-users"     checked>  Users</label>
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
          <div class="snapshot-controls">
            <button id="newSnapshotBtn" class="btn btn-primary">
               Take New Snapshot
            </button>
            <input 
              type="text" 
              id="snapshotName" 
              placeholder="Enter snapshot name..." 
              class="input-field"
              style="margin-bottom: 10px;"
            />

            
          </div>

          <div class="snapshot-list-container">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <h2 style="margin:0;">Saved Snapshots</h2>
              <button id="wipeAllBtn" class="btn btn-danger" style="font-size:11px; padding:5px 10px;" title="Delete all snapshots">Wipe All</button>
            </div>
            <div id="snapshotList" class="snapshot-list">
              <p class="loading">Loading snapshots...</p>
            </div>
          </div>
        </div>

        <div class="main-view">
          <div id="emptyState" class="empty-state">
            <p>Select a snapshot to view details</p>
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
                <button id="compareBtn" class="btn btn-primary">Compare</button>
                <button id="uploadBtn" class="btn btn-upload">Upload</button>
                <button id="deleteBtn" class="btn btn-danger">Delete</button>
              </div>
            </div>

            <div id="comparisonView" class="comparison-view" style="display: none;">
              <h3>Comparison Results</h3>
              <div class="comparison-grid">
                <div class="comparison-card">
                  <h4>New Processes</h4>
                  <div id="newProcessesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>Removed Processes</h4>
                  <div id="removedProcessesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>Process Changes</h4>
                  <div id="processChangesList" class="comparison-list"></div>
                </div>
                <div class="comparison-card">
                  <h4>New Listening Ports</h4>
                  <div id="newPortsList" class="comparison-list"></div>
                </div>
              </div>
            </div>

            <div class="detail-content">
              <section class="system-info">
                <h3>System Information</h3>
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
                    <span class="label">Total Disk</span>
                    <span id="diskInfo" class="value">-</span>
                  </div>
                </div>
              </section>

              <section class="network-section">
                <h3>Network</h3>
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
                <h3>File System</h3>
                <div id="filesystemInfo" class="details-list"></div>
              </section>

              <section class="processes-section">
                <h3>Running Processes</h3>
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

  const wipeAllBtn = document.getElementById('wipeAllBtn');
  if (wipeAllBtn) wipeAllBtn.addEventListener('click', async () => {
    const count = allSnapshots.length;
    if (count === 0) { alert('No snapshots to delete.'); return; }
    if (!confirm(`Are you sure you want to permanently delete all ${count} snapshot(s)? This cannot be undone.`)) return;
    const result = await ipcRenderer.invoke('wipe-all-snapshots');
    if (result.success) {
      currentSnapshot = null;
      await loadSnapshotList();
      emptyState.style.display = 'flex';
      snapshotDetail.style.display = 'none';
      alert(`Deleted ${result.count} snapshot(s).`);
    } else {
      alert(`Error: ${result.error}`);
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
    uploadBtn.textContent = ' Uploading...';
    try {
      const result = await ipcRenderer.invoke('upload-snapshot', currentSnapshot);
      if (result.success) {
        uploadBtn.textContent = 'Uploaded!';
        setTimeout(() => { uploadBtn.textContent = 'Upload'; uploadBtn.disabled = false; }, 2000);
      } else {
        alert(`Upload failed: ${result.error}`);
        uploadBtn.textContent = 'Upload';
        uploadBtn.disabled = false;
      }
    } catch (e) {
      alert(`Upload error: ${e.message}`);
      uploadBtn.textContent = 'Upload';
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
      Verified | SHA256: ${data.integrity.sha256_checksum.substring(0, 16)}... | 
      Signed: ${new Date(data.integrity.signed_at).toLocaleString()}
    `;
  }

  // Display which tests were run as badges
  const badgesEl = document.getElementById('testsRunBadges');
  if (badgesEl) {
    const run = data.metadata?.tests_run;
    if (run) {
      const labels = { cpu: 'CPU & OS', memory: 'Memory', processes: 'Processes', network: 'Network', disk: 'Disk', users: 'Users' };
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
  document.getElementById('diskInfo').textContent = `${data.system.total_disk_size_gb} GB`;

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
  } else if (data.system && data.system.filesystem_info) {
    data.system.filesystem_info.slice(0, 5).forEach(fs => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${fs.mount}</strong>: ${fs.used_gb}GB / ${fs.size_gb}GB (${fs.use_percent}% used)`;
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
  newSnapshotBtn.textContent = 'Taking snapshot...';
  
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
    newSnapshotBtn.textContent = 'Take Snapshot';
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
        alert(`Warning: These snapshots collected different categories (${names}). Comparison results may be incomplete or misleading.`);
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
