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
        <h1>📸 System Snapshot Viewer</h1>
        <p class="subtitle">View and manage system snapshots</p>
      </header>

      <div class="main-content">
        <div class="sidebar">
          <div class="snapshot-controls">
            <button id="newSnapshotBtn" class="btn btn-primary">
              📷 Take New Snapshot
            </button>
            <input 
              type="text" 
              id="snapshotName" 
              placeholder="Enter snapshot name..." 
              class="input-field"
            />
          </div>

          <div class="snapshot-list-container">
            <h2>Saved Snapshots</h2>
            <div id="snapshotList" class="snapshot-list">
              <p class="loading">Loading snapshots...</p>
            </div>
          </div>
        </div>

        <div class="main-view">
          <div id="emptyState" class="empty-state">
            <p>👈 Select a snapshot to view details</p>
          </div>

          <div id="snapshotDetail" class="snapshot-detail" style="display: none;">
            <div class="detail-header">
              <div>
                <h2 id="detailTitle">Snapshot Details</h2>
                <p id="detailTimestamp" class="timestamp"></p>
                <div id="integrityInfo" class="integrity-info"></div>
              </div>
              <div class="header-buttons">
                <select id="compareSelect" class="input-field" style="max-width: 200px;">
                  <option value="">Compare with...</option>
                </select>
                <button id="compareBtn" class="btn btn-primary">📊 Compare</button>
                <button id="uploadBtn" class="btn btn-upload">☁️ Upload</button>
                <button id="deleteBtn" class="btn btn-danger">🗑️ Delete</button>
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
                    <span class="label">Total Disk</span>
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
                <h3>💾 File System</h3>
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
  
  takeNewSnapshot(name);
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

  console.log('Event listeners attached');

  // Load snapshots on startup
  console.log('Loading snapshot list...');
  loadSnapshotList();
}

// Load all saved snapshots
async function loadSnapshotList() {
  try {
    allSnapshots = await ipcRenderer.invoke('list-snapshots');
    renderSnapshotList();
    if (allSnapshots.length === 0) {
      snapshotList.innerHTML = '<p class="loading">No snapshots yet</p>';
    }
  } catch (e) {
    console.error('Error loading snapshots:', e);
  }
}

// Render snapshot list in sidebar
function renderSnapshotList() {
  snapshotList.innerHTML = '';
  allSnapshots.forEach((name) => {
    const item = document.createElement('div');
    item.className = `snapshot-item ${name === currentSnapshot ? 'active' : ''}`;
    item.textContent = name;
    item.addEventListener('click', () => loadSnapshot(name));
    snapshotList.appendChild(item);
  });
  
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
      renderSnapshotList();
      
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

  // Display integrity information
  if (data.integrity) {
    integrityInfo.innerHTML = `
      ✓ Verified | SHA256: ${data.integrity.sha256_checksum.substring(0, 16)}... | 
      Signed: ${new Date(data.integrity.signed_at).toLocaleString()}
    `;
  }

  // System info
  document.getElementById('cpuManufacturer').textContent = data.system.cpu_manufacturer || 'N/A';
  document.getElementById('cpuBrand').textContent = data.system.cpu_brand || 'N/A';
  document.getElementById('cpuCores').textContent = data.system.cpu_cores || 'N/A';
  document.getElementById('totalMemory').textContent = `${data.system.total_memory_gb} GB (${data.system.used_memory_gb} GB used)`;
  document.getElementById('osInfo').textContent = `${data.system.os_distro || 'N/A'} (${data.system.os_release || 'N/A'})`;
  document.getElementById('diskInfo').textContent = `${data.system.total_disk_size_gb} GB`;

  // Network Interfaces
  const networkInterfaces = document.getElementById('networkInterfaces');
  networkInterfaces.innerHTML = '';
  if (data.network && data.network.interfaces) {
    data.network.interfaces.slice(0, 5).forEach(iface => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `
        <strong>${iface.iface}</strong>: ${iface.ip4 || 'N/A'} (${iface.type || 'N/A'})
      `;
      networkInterfaces.appendChild(item);
    });
  }

  // Listening Ports
  const listeningPorts = document.getElementById('listeningPorts');
  listeningPorts.innerHTML = '';
  if (data.network && data.network.listening_ports) {
    data.network.listening_ports.slice(0, 10).forEach(port => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `
        <strong>${port.process_name || 'Unknown'}</strong>: ${port.protocol.toUpperCase()} ${port.local_port}
      `;
      listeningPorts.appendChild(item);
    });
  }

  // File System Info
  const filesystemInfo = document.getElementById('filesystemInfo');
  filesystemInfo.innerHTML = '';
  if (data.system && data.system.filesystem_info) {
    data.system.filesystem_info.slice(0, 5).forEach(fs => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `
        <strong>${fs.mount}</strong>: ${fs.used_gb}GB / ${fs.size_gb}GB (${fs.use_percent}% used)
      `;
      filesystemInfo.appendChild(item);
    });
  }

  // Processes
  renderProcesses(data.running_processes);
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
async function takeNewSnapshot(name) {
  if (!ipcRenderer) {
    console.error('ipcRenderer not available!');
    alert('IPC not available. Please check console.');
    return;
  }
  
  newSnapshotBtn.disabled = true;
  newSnapshotBtn.textContent = '⏳ Taking snapshot...';
  
  try {
    const data = await ipcRenderer.invoke('take-snapshot', name);
    if (data) {
      await loadSnapshotList();
      await loadSnapshot(name);
    }
  } catch (e) {
    console.error('Error taking snapshot:', e);
    alert('Error taking snapshot. Check console for details.');
  } finally {
    newSnapshotBtn.disabled = false;
    newSnapshotBtn.textContent = '📷 Take New Snapshot';
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
