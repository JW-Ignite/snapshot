import "./index.css";

console.log("Renderer.js loaded");

let ipcRenderer;

if (typeof window !== "undefined" && window.require) {
  try {
    ipcRenderer = window.require("electron").ipcRenderer;
    console.log("ipcRenderer loaded:", !!ipcRenderer);
  } catch (e) {
    console.error("Failed to load ipcRenderer:", e);
  }
}

let currentSnapshot = null;
let allSnapshots = [];
let currentDelta = null;
let allDeltas = [];
let activeTab = 'snapshots';
let deltasFeatureAvailable = true;
let hasShownDeltasRestartNotice = false;
let lastTrendPoints = [];

let newSnapshotBtn, snapshotNameInput, snapshotList, emptyState, snapshotDetail;
let detailTitle, detailTimestamp, deleteBtn, processSearch, processList;
let compareSelect, compareBtn, comparisonView, integrityInfo, uploadBtn;
let deltaList, snapshotsTabBtn, deltasTabBtn;
let deltaCompareControls, deltaBeforeSelect, deltaAfterSelect, deltaCreateBtn;
let trendStartDate, trendEndDate, trendGenerateBtn, trendAnalyticsPanel;
let trendPreset24hBtn, trendPreset7dBtn;
let fileSearchPathInput, fileSearchNameInput, fileSearchFolderInput, fileSearchProcessInput, fileSearchRegistryInput, fileSearchVersionInput;
let fileSearchRunBtn, fileSearchResult;

function buildUI() {
  const htmlString = `
    <div class="container">
      <header>
        <h1> System Snapshot Viewer</h1>
        <p class="subtitle">View and manage system snapshots</p>
        <div class="header-row">
          <button id="settingsBtn" class="btn btn-settings" title="Settings">⚙️</button>
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
              <p class="setting-label"><span>Compare categories:</span></p>
              <div class="test-selector">
                <label class="test-option"><input type="checkbox" id="compare-cpu"       checked>  CPU</label>
                <label class="test-option"><input type="checkbox" id="compare-memory"    checked>  Memory</label>
                <label class="test-option"><input type="checkbox" id="compare-processes" checked>  Processes</label>
                <label class="test-option"><input type="checkbox" id="compare-network"   checked>  Network</label>
                <label class="test-option"><input type="checkbox" id="compare-disk"      checked>  Disk</label>
                <label class="test-option"><input type="checkbox" id="compare-users"     checked>  Users</label>
              </div>
              <p class="setting-desc">Choose what delta calculations include (After - Before)</p>
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
            <div class="list-tabs" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap: 8px;">
              <div style="display:flex; gap:6px;">
                <button id="snapshotsTabBtn" class="btn btn-small btn-primary">Snapshots</button>
                <button id="deltasTabBtn" class="btn btn-small">Deltas</button>
              </div>
              <button id="wipeAllBtn" class="btn btn-danger" style="font-size:11px; padding:5px 10px;" title="Delete all snapshots">Wipe All</button>
            </div>
            <div id="deltaCompareControls" style="display:none; margin-bottom:10px;">
              <select id="deltaBeforeSelect" class="input-field" style="margin-bottom:6px;">
                <option value="">Before snapshot...</option>
              </select>
              <select id="deltaAfterSelect" class="input-field" style="margin-bottom:6px;">
                <option value="">After snapshot...</option>
              </select>
              <button id="deltaCreateBtn" class="btn btn-primary" style="width:100%;">Compare 2 Files</button>
              <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.12); padding-top:10px;">
                <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px;">Start (date + time)</label>
                <input id="trendStartDate" type="datetime-local" class="input-field" step="60" style="margin-bottom:6px;" />
                <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px;">End (date + time)</label>
                <input id="trendEndDate" type="datetime-local" class="input-field" step="60" style="margin-bottom:6px;" />
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
                  <button id="trendPreset24h" class="btn btn-small">Last 24h</button>
                  <button id="trendPreset7d" class="btn btn-small">Last 7d</button>
                </div>
                <button id="trendGenerateBtn" class="btn btn-primary" style="width:100%;">Generate Trend Graph</button>
              </div>
            </div>
            <input
              type="text"
              id="snapshotFilter"
              placeholder="Filter snapshots..."
              class="input-field"
              style="margin-bottom: 10px;"
            />
            <div id="snapshotList" class="snapshot-list">
              <p class="loading">Loading snapshots...</p>
            </div>
            <div id="deltaList" class="snapshot-list" style="display:none;">
              <p class="loading">Loading deltas...</p>
            </div>
          </div>
        </div>

        <div class="main-view">
          <div id="fileSearchPanel" class="comparison-view" style="margin-bottom: 18px;">
            <h3>File Search</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-bottom: 8px;">
              <input id="fileSearchPath" class="input-field" placeholder="File path or folder path" />
              <input id="fileSearchName" class="input-field" placeholder="File name (e.g. app.exe)" />
              <input id="fileSearchFolder" class="input-field" placeholder="Folder name (e.g. Program Files)" />
              <input id="fileSearchProcess" class="input-field" placeholder="Process name (e.g. chrome.exe)" />
              <input id="fileSearchRegistry" class="input-field" placeholder="Registry key (e.g. HKLM\\Software\\...)" />
              <input id="fileSearchVersion" class="input-field" placeholder="Expected version (e.g. 1.2.3.4)" />
            </div>
            <button id="fileSearchRunBtn" class="btn btn-primary" style="margin-bottom:10px;">Run File Search</button>
            <div id="fileSearchResult" class="comparison-list"></div>
          </div>

          <div id="emptyState" class="empty-state">
            <p>Select a snapshot to view details</p>
          </div>

          <div id="trendAnalyticsPanel" class="comparison-view" style="display:none; margin-bottom: 18px;">
            <h3>Trend Analytics</h3>
            <p id="trendSummaryText" style="color:#aaa; font-size:12px; margin-bottom:10px;">Pick a date range and generate a graph.</p>
            <div id="trendOverallChanges" class="comparison-list" style="margin-bottom:10px;"></div>
            <div id="trendChartsContainer" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:10px;"></div>
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
                  <option value="">After snapshot...</option>
                </select>
                <button id="compareBtn" class="btn btn-primary">Save Delta</button>
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
                <div class="comparison-card">
                  <h4>Overall Changes</h4>
                  <div id="overallChangesList" class="comparison-list"></div>
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

  console.log("Injecting UI...");
  document.body.innerHTML = htmlString;
}

function scheduleInit() {
  buildUI();
  console.log("UI ready, initializing app...");
  initializeApp();
}

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
  deltaList = document.getElementById('deltaList');
  snapshotsTabBtn = document.getElementById('snapshotsTabBtn');
  deltasTabBtn = document.getElementById('deltasTabBtn');
  deltaCompareControls = document.getElementById('deltaCompareControls');
  deltaBeforeSelect = document.getElementById('deltaBeforeSelect');
  deltaAfterSelect = document.getElementById('deltaAfterSelect');
  deltaCreateBtn = document.getElementById('deltaCreateBtn');
  trendStartDate = document.getElementById('trendStartDate');
  trendEndDate = document.getElementById('trendEndDate');
  trendGenerateBtn = document.getElementById('trendGenerateBtn');
  trendAnalyticsPanel = document.getElementById('trendAnalyticsPanel');
  trendPreset24hBtn = document.getElementById('trendPreset24h');
  trendPreset7dBtn = document.getElementById('trendPreset7d');
  fileSearchPathInput = document.getElementById('fileSearchPath');
  fileSearchNameInput = document.getElementById('fileSearchName');
  fileSearchFolderInput = document.getElementById('fileSearchFolder');
  fileSearchProcessInput = document.getElementById('fileSearchProcess');
  fileSearchRegistryInput = document.getElementById('fileSearchRegistry');
  fileSearchVersionInput = document.getElementById('fileSearchVersion');
  fileSearchRunBtn = document.getElementById('fileSearchRunBtn');
  fileSearchResult = document.getElementById('fileSearchResult');
  const pinBtn = document.getElementById('pinBtn');

  function toDateTimeLocalValue(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function setTrendRange(hoursBack) {
    const end = new Date();
    const start = new Date(end.getTime() - (hoursBack * 60 * 60 * 1000));
    if (trendStartDate) trendStartDate.value = toDateTimeLocalValue(start);
    if (trendEndDate) trendEndDate.value = toDateTimeLocalValue(end);
  }

  setTrendRange(24 * 7);

  function renderFileSearchResult(result) {
    if (!fileSearchResult) return;
    if (!result) {
      fileSearchResult.innerHTML = '<div class="comparison-item">No result returned.</div>';
      return;
    }
    if (result.error) {
      fileSearchResult.innerHTML = `<div class="comparison-item danger">Error: ${result.error}</div>`;
      return;
    }

    const status = (ok) => ok === true ? 'Match' : (ok === false ? 'No Match' : 'Not Checked');
    const processStatus = (kind) => {
      if (kind === 'match') return 'Match';
      if (kind === 'possible') return 'Possible Match';
      if (kind === 'none') return 'No Match';
      return 'Not Checked';
    };
    const boolBadge = (ok) => {
      if (ok === true || ok === 'possible') return 'warning';
      if (ok === false) return 'danger';
      return '';
    };

    const lines = [];
    const hasFileCriteria = Boolean(result.input?.filePath || result.input?.fileName);
    const hasFolderCriteria = Boolean(result.input?.folderName);
    const hasProcessCriteria = Boolean(result.process?.searched_name);
    const hasVersionCriteria = Boolean(result.input?.version);
    const hasRegistryCriteria = Boolean(result.input?.registryKey);

    if (hasFileCriteria) {
      lines.push({ label: 'File Found', value: status(result.file?.found), raw: result.file?.found });
      lines.push({ label: 'Resolved Path', value: result.file?.resolved_path || 'Not found' });
      lines.push({
        label: 'Searched Locations',
        value: Array.isArray(result.file?.searched_locations) && result.file.searched_locations.length > 0
          ? result.file.searched_locations.join(' | ')
          : 'None'
      });
    }

    if (hasFolderCriteria) {
      lines.push({ label: 'Folder Found', value: status(result.folder?.found), raw: result.folder?.found });
      lines.push({ label: 'Resolved Folder Path', value: result.folder?.resolved_path || 'Not found' });
      if (result.folder?.folder_name_matches !== null && result.folder?.folder_name_matches !== undefined) {
        lines.push({ label: 'Folder Name Match', value: status(result.folder.folder_name_matches), raw: result.folder.folder_name_matches });
      }
      lines.push({
        label: 'Folder Search Locations',
        value: Array.isArray(result.folder?.searched_locations) && result.folder.searched_locations.length > 0
          ? result.folder.searched_locations.join(' | ')
          : 'None'
      });
    }

    if (hasProcessCriteria) {
      lines.push({ label: 'Process Search Name', value: result.process.searched_name });
      lines.push({
        label: 'Running Process Match',
        value: processStatus(result.process?.match_status),
        raw: result.process?.match_status === 'match' ? true : (result.process?.match_status === 'possible' ? 'possible' : false)
      });
      lines.push({ label: 'Running Match Count', value: Number.isFinite(result.process?.match_count) ? String(result.process.match_count) : '0' });
      lines.push({ label: 'Exact Match Count', value: Number.isFinite(result.process?.exact_match_count) ? String(result.process.exact_match_count) : '0' });
      lines.push({ label: 'Possible Match Count', value: Number.isFinite(result.process?.possible_match_count) ? String(result.process.possible_match_count) : '0' });
      lines.push({ label: 'Subprocess Count', value: Number.isFinite(result.process?.subprocess_match_count) ? String(result.process.subprocess_match_count) : '0' });
    }

    if (result.file?.file_name_matches !== null && result.file?.file_name_matches !== undefined) {
      lines.push({ label: 'File Name Match', value: status(result.file.file_name_matches), raw: result.file.file_name_matches });
    }

    if (result.file?.metadata) {
      const metadata = result.file.metadata;
      lines.push({ label: 'File Size', value: `${metadata.size_bytes} bytes (${metadata.size_mb} MB)` });

      if (metadata.created_at) lines.push({ label: 'Created', value: metadata.created_at });
      if (metadata.modified_at) lines.push({ label: 'Last Modified', value: metadata.modified_at });
      if (metadata.accessed_at) lines.push({ label: 'Last Accessed', value: metadata.accessed_at });
      if (metadata.sha256) lines.push({ label: 'SHA256', value: metadata.sha256 });
      if (metadata.md5) lines.push({ label: 'MD5', value: metadata.md5 });

      const productName = metadata.windows_version_info?.ProductName;
      const companyName = metadata.windows_version_info?.CompanyName;
      const fileVersion = metadata.windows_version_info?.FileVersion || result.version?.actual;
      const productVersion = metadata.windows_version_info?.ProductVersion;

      if (productName) lines.push({ label: 'Product Name', value: productName });
      if (companyName) lines.push({ label: 'Company', value: companyName });
      if (fileVersion || hasVersionCriteria) lines.push({ label: 'File Version', value: fileVersion || 'Unavailable' });
      if (productVersion) lines.push({ label: 'Product Version', value: productVersion });
    }

    if (hasVersionCriteria) {
      lines.push({ label: 'Version Match', value: status(result.version?.matches), raw: result.version?.matches });
      lines.push({ label: 'Actual Version', value: result.version?.actual || 'Unavailable' });
    }

    if (hasRegistryCriteria) {
      lines.push({ label: 'Registry Key Match', value: status(result.registry?.matches), raw: result.registry?.matches });
    }

    const errors = [result.version?.error, result.registry?.error, result.file?.metadata_error, result.process?.error].filter(Boolean);
    const processMatches = Array.isArray(result.process?.matches) ? result.process.matches : [];
    const processMatchesText = processMatches.length > 0
      ? processMatches
        .slice(0, 10)
        .map((p) => {
          const matchLabel = p.match_type === 'match'
            ? 'Match'
            : (p.match_type === 'possible' ? 'Possible Match' : 'Subprocess');
          const parentPart = p.match_type === 'subprocess' && Number.isFinite(p.ppid)
            ? `, Parent PID ${p.ppid}`
            : '';
          return `${p.name || 'Unknown'} (PID ${p.pid ?? 'Unknown'}${parentPart}, ${matchLabel})`;
        })
        .join(' | ')
      : (result.process?.searched_name ? 'None found' : 'Not checked');

    if (hasProcessCriteria) {
      lines.push({ label: 'Matching Running Processes', value: processMatchesText });
    }

    const lineHtml = lines.map(line => `<div class="comparison-item ${boolBadge(line.raw)}"><strong>${line.label}:</strong> ${line.value}</div>`).join('');
    const errorHtml = errors.map(msg => `<div class="comparison-item danger">${msg}</div>`).join('');
    fileSearchResult.innerHTML = lineHtml + errorHtml;
  }

  async function runFileSearch() {
    if (!ipcRenderer) return;
    const criteria = {
      filePath: fileSearchPathInput?.value || '',
      fileName: fileSearchNameInput?.value || '',
      folderName: fileSearchFolderInput?.value || '',
      processName: fileSearchProcessInput?.value || '',
      registryKey: fileSearchRegistryInput?.value || '',
      version: fileSearchVersionInput?.value || '',
    };

    if (!criteria.filePath && !criteria.fileName && !criteria.folderName && !criteria.processName && !criteria.registryKey && !criteria.version) {
      renderFileSearchResult({ error: 'Enter at least one field to search.' });
      return;
    }

    fileSearchRunBtn.disabled = true;
    fileSearchRunBtn.textContent = 'Checking...';
    try {
      const result = await ipcRenderer.invoke('file-search-check', criteria);
      if (result && !result.process) {
        result.process = {
          searched_name: criteria.processName || criteria.fileName || (criteria.filePath ? criteria.filePath.split(/[/\\]/).pop() : null),
          running: false,
          match_count: 0,
          matches: [],
          error: 'Process search result was not returned by main process. Restart the app to load latest changes.',
        };
      }
      renderFileSearchResult(result);
    } catch (e) {
      renderFileSearchResult({ error: e.message || 'File search failed.' });
    } finally {
      fileSearchRunBtn.disabled = false;
      fileSearchRunBtn.textContent = 'Run File Search';
    }
  }

  if (fileSearchRunBtn) fileSearchRunBtn.addEventListener('click', runFileSearch);
  [fileSearchPathInput, fileSearchNameInput, fileSearchFolderInput, fileSearchProcessInput, fileSearchRegistryInput, fileSearchVersionInput].forEach((el) => {
    if (!el) return;
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runFileSearch();
      }
    });
  });

  // Test selector checkboxes
  const testCheckboxes = {
    cpu: document.getElementById("test-cpu"),
    memory: document.getElementById("test-memory"),
    processes: document.getElementById("test-processes"),
    network: document.getElementById("test-network"),
    disk: document.getElementById("test-disk"),
    users: document.getElementById("test-users"),
  };

  const compareCheckboxes = {
    cpu:       document.getElementById('compare-cpu'),
    memory:    document.getElementById('compare-memory'),
    processes: document.getElementById('compare-processes'),
    network:   document.getElementById('compare-network'),
    disk:      document.getElementById('compare-disk'),
    users:     document.getElementById('compare-users'),
  };

  // Load saved test defaults
  (async () => {
    try {
      const defaults = await ipcRenderer.invoke("get-test-defaults");
      Object.entries(defaults).forEach(([key, val]) => {
        if (testCheckboxes[key]) testCheckboxes[key].checked = val;
      });
    } catch (e) {
      console.error("Failed to load test defaults:", e);
    }
  })();

  Object.entries(testCheckboxes).forEach(([key, el]) => {
    if (el)
      el.addEventListener("change", async () => {
        const tests = {};
        Object.entries(testCheckboxes).forEach(([k, cb]) => {
          tests[k] = cb?.checked ?? true;
        });
        await ipcRenderer.invoke("set-test-defaults", tests);
      });
  });

  // Load saved compare defaults
  (async () => {
    try {
      const defaults = await ipcRenderer.invoke('get-compare-defaults');
      Object.entries(defaults).forEach(([key, val]) => {
        if (compareCheckboxes[key]) compareCheckboxes[key].checked = val;
      });
    } catch (e) { console.error('Failed to load compare defaults:', e); }
  })();

  // Save compare defaults when any compare checkbox changes
  Object.entries(compareCheckboxes).forEach(([key, el]) => {
    if (el) el.addEventListener('change', async () => {
      const categories = {};
      Object.entries(compareCheckboxes).forEach(([k, cb]) => { categories[k] = cb?.checked ?? true; });
      await ipcRenderer.invoke('set-compare-defaults', categories);
    });
  });

  console.log('DOM elements retrieved');
  console.log('newSnapshotBtn:', !!newSnapshotBtn);
  console.log('snapshotList:', !!snapshotList);

  if (!newSnapshotBtn) {
    console.error("ERROR: Could not find newSnapshotBtn element!");
    console.error("Available elements:", Object.keys(document.body));
    return;
  }

  const elements = {
    deleteBtn,
    processSearch,
    compareBtn,
    compareSelect,
    uploadBtn,
    comparisonView,
    integrityInfo,
  };
  Object.entries(elements).forEach(([name, el]) => {
    if (!el) console.error(`ERROR: Could not find element: ${name}`);
  });

  // Event Listeners
  newSnapshotBtn.addEventListener("click", () => {
    const now = new Date();
    const formatted =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      "-" +
      String(now.getMinutes()).padStart(2, "0") +
      "-" +
      String(now.getSeconds()).padStart(2, "0");

    const name = snapshotNameInput.value.trim() || "snapshot_" + formatted;

    const tests = {
      cpu: testCheckboxes.cpu?.checked ?? true,
      memory: testCheckboxes.memory?.checked ?? true,
      processes: testCheckboxes.processes?.checked ?? true,
      network: testCheckboxes.network?.checked ?? true,
      disk: testCheckboxes.disk?.checked ?? true,
      users: testCheckboxes.users?.checked ?? true,
    };

    if (!Object.values(tests).some(Boolean)) {
      alert("Please select at least one category to include in the snapshot.");
      return;
    }

    takeNewSnapshot(name, tests);
    snapshotNameInput.value = "";
  });

  if (deleteBtn)
    deleteBtn.addEventListener("click", () => {
      if (currentSnapshot) {
        deleteSnapshot(currentSnapshot);
      }
    });

  const wipeAllBtn = document.getElementById("wipeAllBtn");
  if (wipeAllBtn)
    wipeAllBtn.addEventListener("click", async () => {
      const count = allSnapshots.length;
      if (count === 0) {
        alert("No snapshots to delete.");
        return;
      }
      if (
        !confirm(
          `Are you sure you want to permanently delete all ${count} snapshot(s)? This cannot be undone.`,
        )
      )
        return;
      const result = await ipcRenderer.invoke("wipe-all-snapshots");
      if (result.success) {
        currentSnapshot = null;
        await loadSnapshotList();
        emptyState.style.display = "flex";
        snapshotDetail.style.display = "none";
        alert(`Deleted ${result.count} snapshot(s).`);
      } else {
        alert(`Error: ${result.error}`);
      }
    });

  if (processSearch)
    processSearch.addEventListener("input", (e) => {
      filterProcesses(e.target.value.toLowerCase());
    });

  // --- Snapshot filter ---
  const snapshotFilter = document.getElementById("snapshotFilter");
  if (snapshotFilter) {
    snapshotFilter.addEventListener("input", (e) => {
      filterSnapshotList(e.target.value.toLowerCase());
    });
  }

  if (compareBtn)
    compareBtn.addEventListener("click", () => {
      const selectedSnapshot = compareSelect.value;
      if (selectedSnapshot) {
        performComparison(currentSnapshot, selectedSnapshot);
      }
    });

  if (pinBtn)
    pinBtn.addEventListener("click", async () => {
      if (!currentSnapshot) return;
      try {
        const data = await ipcRenderer.invoke("load-snapshot", currentSnapshot);
        const isPinned = data?.metadata?.pinned === true;
        const result = await ipcRenderer.invoke(
          "set-snapshot-pinned",
          currentSnapshot,
          !isPinned,
        );
        if (result) {
          pinBtn.textContent = !isPinned ? "📌 Unpin" : "📌 Pin";
          pinBtn.className = !isPinned ? "btn btn-pin pinned" : "btn btn-pin";
          renderSnapshotList();
        }
      } catch (e) {
        console.error("Error toggling pin:", e);
      }
    });

  if (uploadBtn)
    uploadBtn.addEventListener("click", async () => {
      if (!currentSnapshot) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = " Uploading...";
      try {
        const result = await ipcRenderer.invoke(
          "upload-snapshot",
          currentSnapshot,
        );
        if (result.success) {
          uploadBtn.textContent = "Uploaded!";
          setTimeout(() => {
            uploadBtn.textContent = "Upload";
            uploadBtn.disabled = false;
          }, 2000);
        } else {
          alert(`Upload failed: ${result.error}`);
          uploadBtn.textContent = "Upload";
          uploadBtn.disabled = false;
        }
      } catch (e) {
        alert(`Upload error: ${e.message}`);
        uploadBtn.textContent = "Upload";
        uploadBtn.disabled = false;
      }
    });

  if (compareSelect)
    compareSelect.addEventListener("change", (e) => {
      // Button is always visible - no hide/show logic needed
    });

  // --- Max snapshots setting ---
  const maxSnapshotsInput = document.getElementById("maxSnapshotsInput");

  (async () => {
    try {
      const max = await ipcRenderer.invoke("get-max-snapshots");
      maxSnapshotsInput.value = max;
    } catch (e) {
      console.error("Failed to load max-snapshots:", e);
    }
  })();

  maxSnapshotsInput.addEventListener("change", async () => {
    let val = parseInt(maxSnapshotsInput.value, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 9999) val = 9999;
    maxSnapshotsInput.value = val;
    await ipcRenderer.invoke("set-max-snapshots", val);
  });

  console.log("Event listeners attached");

  // --- Data folder ---
  const dataFolderPath = document.getElementById("dataFolderPath");
  const openDataFolderBtn = document.getElementById("openDataFolderBtn");
  const moveDataFolderBtn = document.getElementById("moveDataFolderBtn");
  const resetDataFolderBtn = document.getElementById("resetDataFolderBtn");

  async function refreshDataFolderPath() {
    try {
      const p = await ipcRenderer.invoke("get-data-folder");
      dataFolderPath.textContent = p;
    } catch (e) {
      dataFolderPath.textContent = "Unknown";
    }
  }
  refreshDataFolderPath();

  openDataFolderBtn.addEventListener("click", async () => {
    await ipcRenderer.invoke("open-data-folder");
  });

  moveDataFolderBtn.addEventListener("click", async () => {
    moveDataFolderBtn.disabled = true;
    moveDataFolderBtn.textContent = "⏳ Moving...";
    try {
      const result = await ipcRenderer.invoke("move-data-folder");
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
      moveDataFolderBtn.textContent = "📁 Move";
    }
  });

  resetDataFolderBtn.addEventListener("click", async () => {
    if (
      !confirm(
        "Reset data folder to the default location? Existing files in the custom folder will NOT be moved back.",
      )
    )
      return;
    try {
      const result = await ipcRenderer.invoke("reset-data-folder");
      if (result.success) {
        await refreshDataFolderPath();
        await loadSnapshotList();
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  });

  // --- Settings panel ---
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const autoSnapshotToggle = document.getElementById("autoSnapshotToggle");
  const autoSnapshotIntervalInput = document.getElementById(
    "autoSnapshotInterval",
  );
  const autoSnapshotStatus = document.getElementById("autoSnapshotStatus");

  function updateStatusText(enabled, minutes) {
    autoSnapshotStatus.textContent = enabled
      ? `Auto-snapshots: On (every ${minutes} min)`
      : "Auto-snapshots: Off";
    autoSnapshotStatus.className =
      "setting-status " + (enabled ? "status-on" : "");
  }

  (async () => {
    try {
      const settings = await ipcRenderer.invoke("get-auto-snapshot-settings");
      autoSnapshotToggle.checked = settings.enabled;
      autoSnapshotIntervalInput.value = settings.minutes;
      updateStatusText(settings.enabled, settings.minutes);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  })();

  settingsBtn.addEventListener("click", () => {
    settingsPanel.style.display =
      settingsPanel.style.display === "none" ? "block" : "none";
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.style.display = "none";
  });

  autoSnapshotToggle.addEventListener("change", async () => {
    const enabled = autoSnapshotToggle.checked;
    const minutes = parseInt(autoSnapshotIntervalInput.value, 10) || 5;
    if (enabled) {
      await ipcRenderer.invoke("start-auto-snapshot", minutes);
    } else {
      await ipcRenderer.invoke("stop-auto-snapshot");
    }
    updateStatusText(enabled, minutes);
  });

  autoSnapshotIntervalInput.addEventListener("change", async () => {
    let minutes = parseInt(autoSnapshotIntervalInput.value, 10);
    if (!minutes || minutes < 1) minutes = 1;
    if (minutes > 1440) minutes = 1440;
    autoSnapshotIntervalInput.value = minutes;
    await ipcRenderer.invoke("set-auto-snapshot-interval", minutes);
    if (autoSnapshotToggle.checked) {
      updateStatusText(true, minutes);
    }
  });

  ipcRenderer.on("snapshot-taken", () => {
    loadSnapshotList();
  });

  console.log("Loading snapshot list...");
  loadSnapshotList();
  loadDeltaList();
  switchTab('snapshots');
}

async function loadSnapshotList() {
  try {
    allSnapshots = await ipcRenderer.invoke('list-snapshots');
    refreshDeltaCompareSelects();
    await renderSnapshotList();
    if (allSnapshots.length === 0) {
      snapshotList.innerHTML = '<p class="loading">No snapshots yet</p>';
    }
  } catch (e) {
    console.error("Error loading snapshots:", e);
  }
}

function refreshDeltaCompareSelects() {
  if (!deltaBeforeSelect || !deltaAfterSelect) return;

  const beforeValue = deltaBeforeSelect.value;
  const afterValue = deltaAfterSelect.value;

  deltaBeforeSelect.innerHTML = '<option value="">Before snapshot...</option>';
  deltaAfterSelect.innerHTML = '<option value="">After snapshot...</option>';

  allSnapshots.forEach((name) => {
    const beforeOpt = document.createElement('option');
    beforeOpt.value = name;
    beforeOpt.textContent = name;
    deltaBeforeSelect.appendChild(beforeOpt);

    const afterOpt = document.createElement('option');
    afterOpt.value = name;
    afterOpt.textContent = name;
    deltaAfterSelect.appendChild(afterOpt);
  });

  if (allSnapshots.includes(beforeValue)) deltaBeforeSelect.value = beforeValue;
  if (allSnapshots.includes(afterValue)) deltaAfterSelect.value = afterValue;
}

async function loadDeltaList() {
  if (!deltasFeatureAvailable) {
    allDeltas = [];
    if (deltaList) {
      deltaList.innerHTML = '<p class="loading">Deltas unavailable until app restart</p>';
    }
    return;
  }

  try {
    allDeltas = await ipcRenderer.invoke('list-deltas');
    await renderDeltaList();
    if (allDeltas.length === 0) {
      deltaList.innerHTML = '<p class="loading">No deltas yet</p>';
    }
  } catch (e) {
    if (isMissingHandlerError(e, 'list-deltas')) {
      deltasFeatureAvailable = false;
      allDeltas = [];
      if (deltaList) {
        deltaList.innerHTML = '<p class="loading">Deltas unavailable until app restart</p>';
      }
      notifyDeltasNeedsRestart();
      return;
    }
    console.error('Error loading deltas:', e);
  }
}
const snapshotFilter = document.getElementById("snapshotFilter");
if (snapshotFilter) {
  snapshotFilter.addEventListener("input", (e) => {
    filterSnapshotList(e.target.value.toLowerCase());
  });
}
// Render snapshot list in sidebar
async function renderSnapshotList() {
  snapshotList.innerHTML = "";

  // Re-apply current filter value when re-rendering
  const snapshotFilter = document.getElementById("snapshotFilter");
  const currentFilter = snapshotFilter
    ? snapshotFilter.value.toLowerCase()
    : "";

  for (const name of allSnapshots) {
    const item = document.createElement("div");
    item.className = `snapshot-item ${name === currentSnapshot ? "active" : ""}`;

    let isPinned = false;
    try {
      const data = await ipcRenderer.invoke("load-snapshot", name);
      isPinned = data?.metadata?.pinned === true;
    } catch (e) {
      /* ignore */
    }

    item.innerHTML = `${isPinned ? '<span class="pin-indicator">📌</span> ' : ""}${name}`;
    if (isPinned) item.classList.add("pinned");

    // Apply filter visibility immediately on render
    if (currentFilter && !name.toLowerCase().includes(currentFilter)) {
      item.style.display = "none";
    }

    item.addEventListener("click", () => loadSnapshot(name));
    snapshotList.appendChild(item);
  }
  
  // Update comparison dropdown
  compareSelect.innerHTML = '<option value="">After snapshot...</option>';
  allSnapshots.forEach((name) => {
    if (name !== currentSnapshot) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      compareSelect.appendChild(option);
    }
  });

  compareSelect.value = "";
}

async function renderDeltaList() {
  deltaList.innerHTML = '';
  for (const name of allDeltas) {
    const item = document.createElement('div');
    item.className = `snapshot-item ${name === currentDelta ? 'active' : ''}`;
    item.textContent = name;
    item.addEventListener('click', () => loadDelta(name));
    deltaList.appendChild(item);
  }
}

function switchTab(tab) {
  if (tab === 'deltas' && !deltasFeatureAvailable) {
    notifyDeltasNeedsRestart();
    return;
  }

  activeTab = tab;
  const wipeAllBtn = document.getElementById('wipeAllBtn');

  if (tab === 'snapshots') {
    snapshotsTabBtn?.classList.add('btn-primary');
    deltasTabBtn?.classList.remove('btn-primary');
    snapshotList.style.display = '';
    deltaList.style.display = 'none';
    if (deltaCompareControls) deltaCompareControls.style.display = 'none';
    if (trendAnalyticsPanel) trendAnalyticsPanel.style.display = 'none';
    if (wipeAllBtn) wipeAllBtn.style.display = '';

    if (currentSnapshot) {
      loadSnapshot(currentSnapshot);
    } else {
      emptyState.style.display = 'flex';
      snapshotDetail.style.display = 'none';
    }
    return;
  }

  snapshotsTabBtn?.classList.remove('btn-primary');
  deltasTabBtn?.classList.add('btn-primary');
  snapshotList.style.display = 'none';
  deltaList.style.display = '';
  if (deltaCompareControls) deltaCompareControls.style.display = '';
  if (trendAnalyticsPanel) trendAnalyticsPanel.style.display = '';
  if (wipeAllBtn) wipeAllBtn.style.display = 'none';

  if (currentDelta) {
    loadDelta(currentDelta);
  } else {
    emptyState.style.display = 'flex';
    emptyState.innerHTML = '<p>Select a delta to view results</p>';
    snapshotDetail.style.display = 'none';
  }

  // If a trend was previously generated, redraw it after tab layout settles.
  if (lastTrendPoints.length > 0) {
    setTimeout(() => drawTrendCharts(lastTrendPoints), 0);
  }
}

async function loadDelta(name) {
  if (!deltasFeatureAvailable) return;
  try {
    const data = await ipcRenderer.invoke('load-delta', name);
    if (!data) return;
    currentDelta = name;
    displayDelta(data);
    await renderDeltaList();
  } catch (e) {
    console.error('Error loading delta:', e);
  }
}

// Load and display a snapshot
async function loadSnapshot(name) {
  try {
    const data = await ipcRenderer.invoke("load-snapshot", name);
    if (data) {
      currentSnapshot = name;
      if (activeTab !== 'snapshots') return;
      displaySnapshot(data);
      await renderSnapshotList();
      compareSelect.value = "";
      compareSelect.focus();
    }
  } catch (e) {
    console.error("Error loading snapshot:", e);
  }
}

function displaySnapshot(data) {
  emptyState.innerHTML = '<p>Select a snapshot to view details</p>';
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'flex';
  comparisonView.style.display = 'none';

  const detailContent = document.querySelector('.detail-content');
  if (detailContent) detailContent.style.display = '';
  compareSelect.style.display = '';
  compareBtn.style.display = '';
  uploadBtn.style.display = '';

  detailTitle.textContent = currentSnapshot;
  detailTimestamp.textContent = new Date(
    data.metadata.timestamp,
  ).toLocaleString();

  const pinBtnEl = document.getElementById("pinBtn");
  if (pinBtnEl) {
    const isPinned = data?.metadata?.pinned === true;
    pinBtnEl.textContent = isPinned ? "📌 Unpin" : "📌 Pin";
    pinBtnEl.className = isPinned ? "btn btn-pin pinned" : "btn btn-pin";
  }

  if (data.integrity) {
    integrityInfo.innerHTML = `
      Verified | SHA256: ${data.integrity.sha256_checksum.substring(0, 16)}... | 
      Signed: ${new Date(data.integrity.signed_at).toLocaleString()}
    `;
  }

  const badgesEl = document.getElementById("testsRunBadges");
  if (badgesEl) {
    const run = data.metadata?.tests_run;
    if (run) {
      const labels = {
        cpu: "CPU & OS",
        memory: "Memory",
        processes: "Processes",
        network: "Network",
        disk: "Disk",
        users: "Users",
      };
      badgesEl.innerHTML = Object.entries(labels)
        .map(
          ([key, label]) =>
            `<span class="test-badge ${run[key] ? "badge-on" : "badge-off"}">${label}</span>`,
        )
        .join("");
    } else {
      badgesEl.innerHTML =
        '<span class="test-badge badge-on">All categories</span>';
    }
  }

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

  document.getElementById('cpuManufacturer').textContent = data.system.cpu_manufacturer || 'Unavailable';
  document.getElementById('cpuBrand').textContent = data.system.cpu_brand || 'Unavailable';
  document.getElementById('cpuCores').textContent = data.system.cpu_cores || 'Unavailable';
  document.getElementById('totalMemory').textContent = `${data.system.total_memory_gb} GB (${data.system.used_memory_gb} GB used)`;
  document.getElementById('osInfo').textContent = `${data.system.os_distro || 'Unavailable'} (${data.system.os_release || 'Unavailable'})`;
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
      item.innerHTML = `<strong>${iface.iface}</strong>: ${iface.ip4 || 'Unavailable'} (${iface.type || 'Unavailable'})`;
      networkInterfaces.appendChild(item);
    });
  }

  const listeningPorts = document.getElementById("listeningPorts");
  listeningPorts.innerHTML = "";
  if (run.network !== false && data.network && data.network.listening_ports) {
    data.network.listening_ports.slice(0, 10).forEach((port) => {
      const item = document.createElement("div");
      item.className = "detail-item";
      item.innerHTML = `<strong>${port.process_name || "Unknown"}</strong>: ${port.protocol.toUpperCase()} ${port.local_port}`;
      listeningPorts.appendChild(item);
    });
  }

  const filesystemSection = document.querySelector(".filesystem-section");
  filesystemSection.style.display = run.disk === false ? "none" : "";

  const filesystemInfo = document.getElementById("filesystemInfo");
  filesystemInfo.innerHTML = "";
  if (run.disk !== false && data.system && data.system.filesystem_info) {
    data.system.filesystem_info.slice(0, 5).forEach((fs) => {
      const item = document.createElement("div");
      item.className = "detail-item";
      item.innerHTML = `<strong>${fs.mount}</strong>: ${fs.used_gb}GB / ${fs.size_gb}GB (${fs.use_percent}% used)`;
      filesystemInfo.appendChild(item);
    });
  }

  const processesSection = document.querySelector(".processes-section");
  processesSection.style.display = run.processes === false ? "none" : "";

  if (run.processes !== false) {
    renderProcesses(data.running_processes);
  }

  const usersSection = document.querySelector(".users-section");
  usersSection.style.display = run.users === false ? "none" : "";

  const usersList = document.getElementById("usersList");
  usersList.innerHTML = "";
  if (run.users !== false && data.users && data.users.length > 0) {
    data.users.forEach(u => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `<strong>${u.user}</strong> — tty: ${u.tty || 'Unavailable'} | logged in: ${u.date || ''} ${u.time || ''}`;
      usersList.appendChild(item);
    });
  } else if (run.users !== false) {
    usersList.innerHTML =
      '<p style="color: #999; font-size: 13px;">No users found</p>';
  }
}

function renderProcesses(processes) {
  processList.innerHTML = "";
  processes.forEach((proc) => {
    const item = document.createElement("div");
    item.className = "process-item";
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

function filterProcesses(query) {
  const items = processList.querySelectorAll(".process-item");
  items.forEach((item) => {
    const name = item.querySelector(".process-name").textContent.toLowerCase();
    item.style.display = name.includes(query) ? "flex" : "none";
  });
}

function filterSnapshotList(query) {
  const items = snapshotList.querySelectorAll(".snapshot-item");
  items.forEach((item) => {
    const name = item.textContent.toLowerCase();
    item.style.display = name.includes(query) ? "" : "none";
  });
}

function isMissingHandlerError(error, channelName) {
  const message = error?.message || String(error || '');
  return message.includes(`No handler registered for '${channelName}'`);
}

function notifyDeltasNeedsRestart() {
  if (hasShownDeltasRestartNotice) return;
  hasShownDeltasRestartNotice = true;
  alert('Deltas requires the latest main-process handlers. Please fully restart the Electron app and try again.');
}

// Take a new snapshot
async function takeNewSnapshot(name, tests = {}) {
  if (!ipcRenderer) {
    console.error("ipcRenderer not available!");
    alert("IPC not available. Please check console.");
    return;
  }

  newSnapshotBtn.disabled = true;
  newSnapshotBtn.textContent = "Taking snapshot...";

  try {
    const data = await ipcRenderer.invoke("take-snapshot", name, tests);
    if (data) {
      await loadSnapshotList();
      await loadSnapshot(name);
    }
  } catch (e) {
    console.error("Error taking snapshot:", e);
    alert("Error taking snapshot. Check console for details.");
  } finally {
    newSnapshotBtn.disabled = false;
    newSnapshotBtn.textContent = "Take Snapshot";
  }
}

async function deleteSnapshot(name) {
  if (confirm(`Are you sure you want to delete "${name}"?`)) {
    try {
      const success = await ipcRenderer.invoke("delete-snapshot", name);
      if (success) {
        currentSnapshot = null;
        await loadSnapshotList();
        emptyState.style.display = "flex";
        snapshotDetail.style.display = "none";
      }
    } catch (e) {
      console.error("Error deleting snapshot:", e);
    }
  }
}

async function deleteDelta(name) {
  if (!deltasFeatureAvailable) return;
  if (confirm(`Are you sure you want to delete delta "${name}"?`)) {
    try {
      const success = await ipcRenderer.invoke('delete-delta', name);
      if (success) {
        currentDelta = null;
        await loadDeltaList();
        emptyState.style.display = 'flex';
        emptyState.innerHTML = '<p>Select a delta to view results</p>';
        snapshotDetail.style.display = 'none';
      }
    } catch (e) {
      console.error('Error deleting delta:', e);
    }
  }
}

// Perform comparison between two snapshots
async function performComparison(baselineName, afterName) {
  if (!ipcRenderer) {
    console.error("ipcRenderer not available!");
    return;
  }

  console.log(`Comparing ${baselineName} with ${afterName}...`);

  try {
    const [baselineData, afterData] = await Promise.all([
      ipcRenderer.invoke("load-snapshot", baselineName),
      ipcRenderer.invoke("load-snapshot", afterName),
    ]);

    const baselineRun = baselineData?.metadata?.tests_run;
    const afterRun = afterData?.metadata?.tests_run;
    if (baselineRun && afterRun) {
      const mismatched = Object.keys(baselineRun).filter(
        (k) => baselineRun[k] !== afterRun[k],
      );
      if (mismatched.length > 0) {
        const labels = {
          cpu: "CPU & OS",
          memory: "Memory",
          processes: "Processes",
          network: "Network",
          disk: "Disk",
          users: "Users",
        };
        const names = mismatched.map((k) => labels[k] || k).join(", ");
        alert(
          `Warning: These snapshots collected different categories (${names}). Comparison results may be incomplete or misleading.`,
        );
      }
    }

    const selectedCategories = {
      cpu: document.getElementById('compare-cpu')?.checked ?? true,
      memory: document.getElementById('compare-memory')?.checked ?? true,
      processes: document.getElementById('compare-processes')?.checked ?? true,
      network: document.getElementById('compare-network')?.checked ?? true,
      disk: document.getElementById('compare-disk')?.checked ?? true,
      users: document.getElementById('compare-users')?.checked ?? true,
    };

    if (!Object.values(selectedCategories).some(Boolean)) {
      alert('Please select at least one compare category in Settings.');
      return;
    }

    const comparison = await ipcRenderer.invoke('compare-snapshots', baselineName, afterName, selectedCategories, true);
    
    if (comparison) {
      await loadDeltaList();
      if (comparison.delta_name) {
        switchTab('deltas');
        await loadDelta(comparison.delta_name);
      } else {
        displayComparison(comparison);
      }
    }
  } catch (e) {
    console.error("Error comparing snapshots:", e);
    alert("Error comparing snapshots. Check console for details.");
  }
}

function displayDelta(deltaPayload) {
  const meta = deltaPayload?.metadata || {};
  const delta = deltaPayload?.delta || {};

  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'flex';
  comparisonView.style.display = 'block';

  detailTitle.textContent = meta.delta_name || currentDelta || 'Delta';
  detailTimestamp.textContent = new Date(meta.created_at || Date.now()).toLocaleString();
  integrityInfo.textContent = `Before: ${meta.before_snapshot || '-'} | After: ${meta.after_snapshot || '-'} | Direction: After - Before`;

  const badgesEl = document.getElementById('testsRunBadges');
  if (badgesEl) {
    const categories = meta.compare_categories || {};
    const labels = { cpu: 'CPU', memory: 'Memory', processes: 'Processes', network: 'Network', disk: 'Disk', users: 'Users' };
    badgesEl.innerHTML = Object.entries(labels).map(([key, label]) =>
      `<span class="test-badge ${categories[key] ? 'badge-on' : 'badge-off'}">${label}</span>`
    ).join('');
  }

  const detailContent = document.querySelector('.detail-content');
  if (detailContent) detailContent.style.display = 'none';
  compareSelect.style.display = 'none';
  compareBtn.style.display = 'none';
  uploadBtn.style.display = 'none';

  displayComparison(delta);
}

// Display comparison results
function displayComparison(comparison) {
  comparisonView.style.display = "block";

  const newProcessesList = document.getElementById("newProcessesList");
  newProcessesList.innerHTML = "";
  if (comparison.new_processes.length > 0) {
    comparison.new_processes.forEach((proc) => {
      const item = document.createElement("div");
      item.className = "comparison-item warning";
      item.innerHTML = `
        <strong>${proc.name}</strong> (PID: ${proc.pid})<br/>
        CPU: ${proc.cpu_usage.toFixed(2)}% | Memory: ${proc.mem_usage.toFixed(2)}%
      `;
      newProcessesList.appendChild(item);
    });
  } else {
    newProcessesList.innerHTML =
      '<p style="color: #999; font-size: 12px;">No new processes</p>';
  }

  const removedProcessesList = document.getElementById("removedProcessesList");
  removedProcessesList.innerHTML = "";
  if (comparison.removed_processes.length > 0) {
    comparison.removed_processes.forEach((proc) => {
      const item = document.createElement("div");
      item.className = "comparison-item danger";
      item.innerHTML = `<strong>${proc.name}</strong> (PID: ${proc.pid})`;
      removedProcessesList.appendChild(item);
    });
  } else {
    removedProcessesList.innerHTML =
      '<p style="color: #999; font-size: 12px;">No removed processes</p>';
  }

  const processChangesList = document.getElementById("processChangesList");
  processChangesList.innerHTML = "";
  const significantChanges = comparison.process_changes
    .sort((a, b) => Math.abs(b.cpu_change) - Math.abs(a.cpu_change))
    .slice(0, 10);

  if (significantChanges.length > 0) {
    significantChanges.forEach((change) => {
      const item = document.createElement("div");
      item.className =
        "comparison-item " + (Math.abs(change.cpu_change) > 2 ? "warning" : "");
      item.innerHTML = `
        <strong>${change.name}</strong><br/>
        CPU: ${change.cpu_before.toFixed(2)}% → ${change.cpu_after.toFixed(2)}% 
        (${change.cpu_change > 0 ? "+" : ""}${change.cpu_change.toFixed(2)}%)<br/>
        Memory: ${change.mem_before.toFixed(2)}% → ${change.mem_after.toFixed(2)}% 
        (${change.mem_change > 0 ? "+" : ""}${change.mem_change.toFixed(2)}%)
      `;
      processChangesList.appendChild(item);
    });
  } else {
    processChangesList.innerHTML =
      '<p style="color: #999; font-size: 12px;">No significant changes</p>';
  }

  const newPortsList = document.getElementById("newPortsList");
  newPortsList.innerHTML = "";
  if (comparison.new_listening_ports.length > 0) {
    comparison.new_listening_ports.slice(0, 10).forEach((port) => {
      const item = document.createElement("div");
      item.className = "comparison-item warning";
      item.innerHTML = `
        <strong>${port.process_name || "Unknown"}</strong> (PID: ${port.pid})<br/>
        ${port.protocol.toUpperCase()} ${port.local_address}:${port.local_port}
      `;
      newPortsList.appendChild(item);
    });
    if (comparison.new_listening_ports.length > 10) {
      const item = document.createElement("div");
      item.style.padding = "8px";
      item.style.color = "#999";
      item.textContent = `...and ${comparison.new_listening_ports.length - 10} more`;
      newPortsList.appendChild(item);
    }
  } else {
    newPortsList.innerHTML =
      '<p style="color: #999; font-size: 12px;">No new listening ports</p>';
  }

  const overallChangesList = document.getElementById('overallChangesList');
  if (overallChangesList) {
    const memoryChange = comparison.memory_change_gb;
    const cpuUsageChange = comparison.cpu_usage_change_percent;
    const diskUsedChange = comparison.disk_used_change_gb;
    const diskIoChange = comparison.disk_io_change_mb;
    const diskIoRate = comparison.disk_io_avg_mb_s;

    const lines = [
      { label: 'Memory Used Delta', value: memoryChange, unit: ' GB' },
      { label: 'CPU Usage Delta', value: cpuUsageChange, unit: ' %' },
      { label: 'Disk Used Delta', value: diskUsedChange, unit: ' GB' },
      { label: 'Disk IO Delta', value: diskIoChange, unit: ' MB' },
      { label: 'Disk Speed (Avg)', value: diskIoRate, unit: ' MB/s' },
      { label: 'Time Difference', value: comparison.time_diff_minutes, unit: ' min' },
    ];

    overallChangesList.innerHTML = lines.map((line) => {
      if (line.value === null || line.value === undefined) {
        return `<div class="comparison-item">${line.label}: Unavailable</div>`;
      }
      const numeric = Number(line.value);
      const sign = Number.isFinite(numeric) && numeric > 0 ? '+' : '';
      return `<div class="comparison-item">${line.label}: ${sign}${line.value}${line.unit}</div>`;
    }).join('');
  }
}

function toNum(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function extractSnapshotFactorPoint(name, snapshot) {
  const ts = new Date(snapshot?.metadata?.timestamp || '').getTime();
  if (!Number.isFinite(ts)) return null;

  const fsInfo = Array.isArray(snapshot?.system?.filesystem_info) ? snapshot.system.filesystem_info : [];
  const diskUsedGb = fsInfo.reduce((sum, fs) => sum + toNum(fs.used_gb), 0);
  const readBytes = toNum(snapshot?.system?.disk_read_bytes);
  const writeBytes = toNum(snapshot?.system?.disk_write_bytes);

  return {
    name,
    ts,
    label: new Date(ts).toLocaleString(),
    memoryUsedGb: toNum(snapshot?.system?.used_memory_gb),
    cpuUsagePercent: toNum(snapshot?.system?.cpu_usage_percent),
    diskUsedGb,
    diskIoTotalMb: (readBytes + writeBytes) / (1024 * 1024),
    diskSpeedMbS: 0,
    processCount: Array.isArray(snapshot?.running_processes) ? snapshot.running_processes.length : 0,
    listeningPortsCount: Array.isArray(snapshot?.network?.listening_ports) ? snapshot.network.listening_ports.length : 0,
  };
}

function formatScaleValue(value, unit = '') {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${value.toFixed(0)}${unit}`;
  if (Math.abs(value) >= 100) return `${value.toFixed(1)}${unit}`;
  return `${value.toFixed(2)}${unit}`;
}

function drawSingleFactorChart(canvas, points, factor) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, width, height);

  const pad = { top: 26, right: 16, bottom: 38, left: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = points.map(p => toNum(p[factor.key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.0001);

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsSpan = Math.max(maxTs - minTs, 1);

  function xFor(ts) {
    return pad.left + ((ts - minTs) / tsSpan) * plotW;
  }

  function yFor(value) {
    const ratio = (value - min) / range;
    return pad.top + (1 - ratio) * plotH;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  // Y-axis scale labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px Space Mono';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i / 4);
    const value = max - (range * i / 4);
    const label = formatScaleValue(value, factor.unit || '');
    const w = ctx.measureText(label).width;
    ctx.fillText(label, pad.left - 8 - w, y + 3);
  }

  // Axis line
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.stroke();

  // Trend line
  ctx.strokeStyle = factor.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = xFor(p.ts);
    const y = yFor(toNum(p[factor.key]));
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = factor.color;
  points.forEach((p) => {
    const x = xFor(p.ts);
    const y = yFor(toNum(p[factor.key]));
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#e5e7eb';
  ctx.font = '12px Poppins';
  ctx.fillText(factor.label, pad.left, 16);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px Space Mono';
  const start = new Date(minTs).toLocaleString();
  const end = new Date(maxTs).toLocaleString();
  ctx.fillText(start, pad.left, height - 14);
  const endW = ctx.measureText(end).width;
  ctx.fillText(end, width - pad.right - endW, height - 14);
}

function drawTrendCharts(points) {
  const container = document.getElementById('trendChartsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!points || points.length < 2) {
    const msg = document.createElement('div');
    msg.className = 'comparison-item';
    msg.textContent = 'Need at least 2 snapshots in range to draw trend graphs.';
    container.appendChild(msg);
    return;
  }

  const factors = [
    { key: 'memoryUsedGb', label: 'Memory Used', color: '#7dd3fc', unit: ' GB' },
    { key: 'diskUsedGb', label: 'Disk Used', color: '#fde047', unit: ' GB' },
    { key: 'cpuUsagePercent', label: 'CPU Usage', color: '#a7f3d0', unit: ' %' },
    { key: 'diskSpeedMbS', label: 'Disk Speed', color: '#fca5a5', unit: ' MB/s' },
    { key: 'processCount', label: 'Process Count', color: '#c4b5fd', unit: '' },
    { key: 'listeningPortsCount', label: 'Listening Ports', color: '#fdba74', unit: '' },
  ];

  factors.forEach((factor) => {
    const wrapper = document.createElement('div');
    wrapper.style.background = '#0f0f0f';
    wrapper.style.border = '1px solid rgba(255,255,255,0.12)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '8px';

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '220px';
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    drawSingleFactorChart(canvas, points, factor);
  });
}

function renderTrendOverallChanges(points) {
  const summaryEl = document.getElementById('trendOverallChanges');
  const summaryTextEl = document.getElementById('trendSummaryText');
  if (!summaryEl || !summaryTextEl) return;
  if (!points.length) {
    summaryTextEl.textContent = 'No snapshots found in the chosen date range.';
    summaryEl.innerHTML = '<div class="comparison-item">No data to summarize.</div>';
    return;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const elapsedSec = Math.max((last.ts - first.ts) / 1000, 0);
  const diskIoDeltaMb = last.diskIoTotalMb - first.diskIoTotalMb;
  const diskIoAvgMbS = elapsedSec > 0 ? diskIoDeltaMb / elapsedSec : 0;
  const maxDiskSpeed = Math.max(...points.map(p => toNum(p.diskSpeedMbS)));

  summaryTextEl.textContent = `${points.length} snapshots from ${new Date(first.ts).toLocaleString()} to ${new Date(last.ts).toLocaleString()}`;
  const lines = [
    { label: 'Memory Used Change', value: (last.memoryUsedGb - first.memoryUsedGb).toFixed(2), unit: ' GB' },
    { label: 'Disk Used Change', value: (last.diskUsedGb - first.diskUsedGb).toFixed(2), unit: ' GB' },
    { label: 'CPU Usage Change', value: (last.cpuUsagePercent - first.cpuUsagePercent).toFixed(2), unit: ' %' },
    { label: 'Disk IO Change', value: diskIoDeltaMb.toFixed(2), unit: ' MB' },
    { label: 'Disk Speed (Avg)', value: diskIoAvgMbS.toFixed(2), unit: ' MB/s' },
    { label: 'Disk Speed (Peak)', value: maxDiskSpeed.toFixed(2), unit: ' MB/s' },
    { label: 'Process Count Change', value: (last.processCount - first.processCount), unit: '' },
    { label: 'Listening Ports Change', value: (last.listeningPortsCount - first.listeningPortsCount), unit: '' },
  ];

  summaryEl.innerHTML = lines.map((line) => {
    const n = Number(line.value);
    const sign = Number.isFinite(n) && n > 0 ? '+' : '';
    return `<div class="comparison-item">${line.label}: ${sign}${line.value}${line.unit}</div>`;
  }).join('');
}

async function generateTrendAnalytics(startTs, endTs) {
  // Always refresh names first so newly created snapshots are included.
  const latestSnapshotNames = await ipcRenderer.invoke('list-snapshots');
  allSnapshots = Array.isArray(latestSnapshotNames) ? latestSnapshotNames : [];
  refreshDeltaCompareSelects();

  const points = [];
  for (const name of allSnapshots) {
    try {
      const data = await ipcRenderer.invoke('load-snapshot', name);
      const p = extractSnapshotFactorPoint(name, data);
      if (!p) continue;
      if (p.ts < startTs || p.ts > endTs) continue;
      if (p) points.push(p);
    } catch {
      // Skip unreadable snapshots.
    }
  }

  points.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      points[i].diskSpeedMbS = 0;
      continue;
    }
    const prev = points[i - 1];
    const curr = points[i];
    const elapsedSec = Math.max((curr.ts - prev.ts) / 1000, 0);
    if (elapsedSec <= 0) {
      curr.diskSpeedMbS = 0;
      continue;
    }
    const deltaMb = curr.diskIoTotalMb - prev.diskIoTotalMb;
    curr.diskSpeedMbS = deltaMb / elapsedSec;
  }

  lastTrendPoints = points;

  // Force the trend panel to the foreground in deltas workflow.
  emptyState.style.display = 'none';
  snapshotDetail.style.display = 'none';
  if (trendAnalyticsPanel) trendAnalyticsPanel.style.display = '';
  renderTrendOverallChanges(points);

  // Draw after layout pass so canvas dimensions are correct on first render.
  requestAnimationFrame(() => drawTrendCharts(points));
}

window.addEventListener('resize', () => {
  if (activeTab === 'deltas' && lastTrendPoints.length > 1) {
    drawTrendCharts(lastTrendPoints);
  }
});
