const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');
const HARDCODED_SNAPSHOT_SERVER_URL = 'https://instasnapshot.vercel.app';
const HARDCODED_SNAPSHOT_API_KEY = 'EVERLIJvivjSNFSVUFDshgognSGAGFOurgergAGBUeraogferogVbneRAOBO';

function resolveSnapshotServerUrl() {
  const candidate = HARDCODED_SNAPSHOT_SERVER_URL;
  const hasProtocol = /^https?:\/\//i.test(candidate);
  const normalized = hasProtocol ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();

    // Enforce remote uploads only.
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

// Helper: make an HTTP/HTTPS request (no fetch in older Node)
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// 1. The Snapshot Function
async function takeSnapshot(filename, tests = {}) {
  // Default every category to true so existing callers still work
  const run = {
    cpu:       tests.cpu       ?? true,
    memory:    tests.memory    ?? true,
    processes: tests.processes ?? true,
    network:   tests.network   ?? true,
    disk:      tests.disk      ?? true,
    users:     tests.users     ?? true,
  };

  console.log('Tests to run:', run);

  try {
    console.log(`Taking snapshot: ${filename}...`);
    
    // Grab only the requested data categories
    console.log('Fetching CPU info...');
    const cpu = run.cpu ? await si.cpu() : {};
    console.log('Fetching memory info...');
    const mem = run.memory ? await si.mem() : {};
    
    console.log('Fetching processes...');
    const processes = run.processes ? await si.processes() : { list: [] };
    if (run.processes) console.log(`Found ${processes.list.length} processes`);
    
    console.log('Fetching network interfaces...');
    const networkInterfaces = run.network ? await si.networkInterfaces() : [];
    console.log('Fetching network stats...');
    const networkStats = run.network ? await si.networkStats() : [];
    console.log('Fetching open connections...');
    const networkConnections = run.network ? await si.networkConnections() : [];
    console.log('Fetching disk layout...');
    const diskLayout = run.disk ? await si.diskLayout() : [];
    console.log('Fetching file system size...');
    const fsSize = run.disk ? await si.fsSize() : [];
    console.log('Fetching OS info...');
    const osInfo = run.cpu ? await si.osInfo() : {};
    console.log('Fetching users...');
    const users = run.users ? await si.users() : [];

    // Format it into a comprehensive JSON object
    const snapshotData = {
      metadata: {
        snapshot_name: filename,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        snapshot_version: '2.0',
        data_collection_method: 'systeminformation library',
        tests_run: run
      },
      system: {
        // CPU Info
        cpu_manufacturer: cpu.manufacturer,
        cpu_brand: cpu.brand,
        cpu_cores: cpu.cores,
        cpu_speed_ghz: cpu.speed,
        
        // Memory Info
        total_memory_gb: (mem.total / 1024 / 1024 / 1024).toFixed(2),
        used_memory_gb: (mem.used / 1024 / 1024 / 1024).toFixed(2),
        available_memory_gb: (mem.available / 1024 / 1024 / 1024).toFixed(2),
        
        // OS Info
        os_platform: osInfo.platform,
        os_distro: osInfo.distro,
        os_release: osInfo.release,
        os_kernel: osInfo.kernel,
        os_arch: osInfo.arch,
        
        // Disk Info
        disk_count: diskLayout.length,
        total_disk_size_gb: diskLayout.reduce((sum, d) => sum + (d.size / 1024 / 1024 / 1024), 0).toFixed(2),
        filesystem_info: fsSize.map(fs => ({
          mount: fs.mount,
          size_gb: (fs.size / 1024 / 1024 / 1024).toFixed(2),
          used_gb: (fs.used / 1024 / 1024 / 1024).toFixed(2),
          available_gb: (fs.available / 1024 / 1024 / 1024).toFixed(2),
          use_percent: fs.use.toFixed(2)
        }))
      },
      network: {
        interfaces: networkInterfaces.map(iface => ({
          iface: iface.iface,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          type: iface.type,
          speed: iface.speed
        })),
        stats: networkStats.map(stat => ({
          iface: stat.iface,
          rx_bytes: stat.rx_bytes,
          tx_bytes: stat.tx_bytes,
          rx_errors: stat.rx_errors,
          tx_errors: stat.tx_errors
        })),
        listening_ports: networkConnections
          .filter(conn => conn.state === 'LISTEN')
          .map(conn => ({
            protocol: conn.protocol,
            local_address: conn.local,
            local_port: conn.localport,
            process_name: conn.process,
            pid: conn.pid
          }))
          .slice(0, 50) // Limit to 50 ports
      },
      running_processes: processes.list.map(p => ({
        name: p.name,
        pid: p.pid,
        ppid: p.ppid,
        cpu_usage: p.cpu,
        mem_usage: p.mem,
        command: p.command || 'N/A',
        user: p.user || 'N/A',
        state: p.state || 'N/A',
        priority: p.priority || 0,
        virtual_memory_mb: ((p.vsz || 0) / 1024).toFixed(2),
        resident_memory_mb: ((p.rss || 0) / 1024).toFixed(2)
      }))
      .sort((a, b) => b.cpu_usage - a.cpu_usage), // Sort by CPU usage
      
      users: users.map(u => ({
        user: u.user,
        tty: u.tty,
        date: u.date,
        time: u.time
      }))
    };

    // Generate cryptographic signature
    const snapshotJson = JSON.stringify(snapshotData);
    const checksum = crypto.createHash('sha256').update(snapshotJson).digest('hex');
    
    const signedSnapshot = {
      ...snapshotData,
      integrity: {
        sha256_checksum: checksum,
        signed_at: new Date().toISOString(),
        signing_method: 'SHA256'
      }
    };

    // Save it as a local JSON file (works 100% offline)
    const savePath = path.join(getSnapshotDir(), `${filename}.json`);
    console.log(`Saving to: ${savePath}`);
    
    // Ensure directory exists
    const dir = getSnapshotDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
    
    fs.writeFileSync(savePath, JSON.stringify(signedSnapshot, null, 2));
    
    console.log(`Snapshot saved to: ${savePath}`);
    console.log(`Checksum: ${checksum}`);
    return signedSnapshot;

  } catch (e) {
    console.error("Error taking snapshot:", e.message);
    console.error(e.stack);
    throw e;
  }
}

// 2. Set up the Electron Window (Standard Boilerplate)
let mainWindow = null;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();
};

// 4. Set up IPC handlers to communicate with renderer
ipcMain.handle('take-snapshot', async (event, filename, tests) => {
  const result = await takeSnapshot(filename, tests);
  enforceRetentionLimit();
  return result;
});

ipcMain.handle('list-snapshots', async (event) => {
  try {
    const snapshotDir = getSnapshotDir();
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json') && f !== '_snapshot_settings.json');
    return files.map(f => f.replace('.json', ''));
  } catch (e) {
    console.error("Error listing snapshots:", e);
    return [];
  }
});

ipcMain.handle('load-snapshot', async (event, filename) => {
  try {
    const snapshotPath = path.join(getSnapshotDir(), `${filename}.json`);
    const data = fs.readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error("Error loading snapshot:", e);
    return null;
  }
});

ipcMain.handle('delete-snapshot', async (event, filename) => {
  try {
    const snapshotPath = path.join(getSnapshotDir(), `${filename}.json`);
    fs.unlinkSync(snapshotPath);
    return true;
  } catch (e) {
    console.error("Error deleting snapshot:", e);
    return false;
  }
});

ipcMain.handle('compare-snapshots', async (event, baselineName, afterName) => {
  try {
    const baselinePath = path.join(getSnapshotDir(), `${baselineName}.json`);
    const afterPath = path.join(getSnapshotDir(), `${afterName}.json`);
    
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf-8'));
    
    const baselineProcessNames = new Set(baseline.running_processes.map(p => p.name));
    const afterProcessNames = new Set(after.running_processes.map(p => p.name));
    
    const newProcesses = after.running_processes.filter(
      p => !baselineProcessNames.has(p.name)
    );
    
    const removedProcesses = baseline.running_processes.filter(
      p => !afterProcessNames.has(p.name)
    );
    
    // Find processes with significant CPU/Memory changes
    const processChanges = after.running_processes
      .map(afterProc => {
        const baselineProc = baseline.running_processes.find(p => p.name === afterProc.name);
        if (baselineProc) {
          return {
            name: afterProc.name,
            cpu_change: afterProc.cpu_usage - baselineProc.cpu_usage,
            mem_change: afterProc.mem_usage - baselineProc.mem_usage,
            cpu_before: baselineProc.cpu_usage,
            cpu_after: afterProc.cpu_usage,
            mem_before: baselineProc.mem_usage,
            mem_after: afterProc.mem_usage
          };
        }
        return null;
      })
      .filter(p => p && (Math.abs(p.cpu_change) > 0.5 || Math.abs(p.mem_change) > 0.5));
    
    return {
      baseline_timestamp: baseline.metadata.timestamp,
      after_timestamp: after.metadata.timestamp,
      time_diff_minutes: Math.round((new Date(after.metadata.timestamp) - new Date(baseline.metadata.timestamp)) / 60000),
      new_processes: newProcesses,
      removed_processes: removedProcesses,
      process_changes: processChanges,
      memory_change_gb: (parseFloat(after.system.used_memory_gb) - parseFloat(baseline.system.used_memory_gb)).toFixed(2),
      new_listening_ports: after.network.listening_ports.filter(
        p => !baseline.network.listening_ports.some(bp => bp.local_port === p.local_port)
      )
    };
  } catch (e) {
    console.error("Error comparing snapshots:", e);
    return null;
  }
});

ipcMain.handle('upload-snapshot', async (event, filename) => {
  const withStatus = (baseData, status, errorMessage = null) => {
    const safeBase = baseData && typeof baseData === 'object' ? baseData : {};
    const baseMetadata = safeBase.metadata && typeof safeBase.metadata === 'object'
      ? safeBase.metadata
      : {};

    return {
      ...safeBase,
      metadata: {
        ...baseMetadata,
        snapshot_status: status,
        error: errorMessage,
        status_updated_at: new Date().toISOString(),
      },
    };
  };

  const createSnapshotRow = async (serverUrl, apiKey, payload) => {
    const body = JSON.stringify(payload);
    const url = new URL('/api/snapshots', serverUrl);

    const result = await makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    return result;
  };

  try {
    const serverUrl = resolveSnapshotServerUrl();
    const apiKey = HARDCODED_SNAPSHOT_API_KEY;
    if (!serverUrl) {
      return {
        success: false,
        error: 'Hardcoded snapshot server URL is invalid or points to localhost.'
      };
    }

    const machineId = process.env.MACHINE_ID || require('os').hostname();
    const machineName = process.env.MACHINE_NAME || require('os').hostname();

    // Load the local snapshot
    const snapshotPath = path.join(getSnapshotDir(), `${filename}.json`);
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

    // Use a single POST upload so older deployed APIs that fail PATCH still work.
    const payload = {
      machine_id: machineId,
      machine_name: machineName,
      snapshot_name: filename,
      data: withStatus(data, 'Completed'),
    };

    const result = await createSnapshotRow(serverUrl, apiKey, payload);
    if (result.status === 200 || result.status === 201) {
      return { success: true, id: result.body?.id || null };
    }

    return { success: false, error: result.body?.message || result.body?.error || `HTTP ${result.status}` };
  } catch (e) {
    console.error('Error uploading snapshot:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-remote-snapshots', async (event) => {
  try {
    const serverUrl = resolveSnapshotServerUrl();
    const apiKey = HARDCODED_SNAPSHOT_API_KEY;

    if (!serverUrl || !apiKey) return [];

    const machineId = process.env.MACHINE_ID || require('os').hostname();
    const url = new URL(`/api/snapshots?machine_id=${encodeURIComponent(machineId)}`, serverUrl);

    const result = await makeRequest(url.toString(), {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    }, null);

    return result.status === 200 ? result.body : [];
  } catch (e) {
    console.error('Error listing remote snapshots:', e);
    return [];
  }
});

let autoSnapshotInterval = null;
let autoSnapshotMinutes = 5;
let autoSnapshotEnabled = false;
let maxSnapshots = 0; // 0 = unlimited
let testDefaults = { cpu: true, memory: true, processes: true, network: true, disk: true, users: true };
let customSnapshotDir = null; // null = use default userData path

// Returns the active snapshot data directory
function getSnapshotDir() {
  return customSnapshotDir || app.getPath('userData');
}

// --- Settings persistence ---
function getSettingsPath() {
  return path.join(app.getPath('userData'), '_snapshot_settings.json');
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
      maxSnapshots = s.maxSnapshots ?? 0;
      autoSnapshotMinutes = s.autoSnapshotMinutes ?? 5;
      autoSnapshotEnabled = s.autoSnapshotEnabled ?? false;
      customSnapshotDir = s.customSnapshotDir ?? null;
      if (s.testDefaults) testDefaults = { ...testDefaults, ...s.testDefaults };
    }
  } catch (e) { console.error('Failed to load settings:', e); }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify({
      maxSnapshots,
      autoSnapshotEnabled,
      autoSnapshotMinutes,
      testDefaults,
      customSnapshotDir
    }));
  } catch (e) { console.error('Failed to save settings:', e); }
}

// --- Retention enforcement ---
function enforceRetentionLimit() {
  if (maxSnapshots <= 0) return; // unlimited
  try {
    const snapshotDir = getSnapshotDir();
    const files = fs.readdirSync(snapshotDir)
      .filter(f => f.endsWith('.json') && f !== '_snapshot_settings.json');

    // Load all snapshots and separate pinned from unpinned
    const snapshots = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(snapshotDir, f), 'utf-8'));
        return { file: f, data, pinned: data?.metadata?.pinned === true, timestamp: data?.metadata?.timestamp || '' };
      } catch { return null; }
    }).filter(Boolean);

    const unpinned = snapshots.filter(s => !s.pinned);
    // Sort unpinned by timestamp ascending (oldest first)
    unpinned.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const toDelete = unpinned.length - maxSnapshots;
    if (toDelete > 0) {
      for (let i = 0; i < toDelete; i++) {
        const filePath = path.join(snapshotDir, unpinned[i].file);
        fs.unlinkSync(filePath);
        console.log(`Retention: deleted ${unpinned[i].file}`);
      }
    }
  } catch (e) { console.error('Error enforcing retention:', e); }
}

// --- Pin/unpin ---
ipcMain.handle('set-snapshot-pinned', async (event, filename, pinned) => {
  try {
    const snapshotPath = path.join(getSnapshotDir(), `${filename}.json`);
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    data.metadata.pinned = pinned;
    fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));
    // Re-enforce retention in case unpinning freed a slot
    enforceRetentionLimit();
    return true;
  } catch (e) {
    console.error('Error setting pin:', e);
    return false;
  }
});

// --- Max snapshots ---
ipcMain.handle('get-max-snapshots', () => maxSnapshots);

ipcMain.handle('set-max-snapshots', (event, value) => {
  maxSnapshots = value;
  saveSettings();
  enforceRetentionLimit();
  if (mainWindow) mainWindow.webContents.send('snapshot-taken'); // refresh list
  return true;
});

function formatSnapshotTimestamp() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0') + '-' +
    String(now.getSeconds()).padStart(2, '0');
}

function startAutoSnapshot(minutes) {
  if (minutes !== undefined) {
    autoSnapshotMinutes = minutes;
  }
  stopAutoSnapshot();
  autoSnapshotEnabled = true;
  saveSettings();

  // Take one immediately on start
  takeSnapshot(`snapshot_${formatSnapshotTimestamp()}_auto`)
    .then(() => {
      enforceRetentionLimit();
      if (mainWindow) mainWindow.webContents.send('snapshot-taken');
    })
    .catch(e => console.error('Auto-snapshot failed:', e.message));

  autoSnapshotInterval = setInterval(async () => {
    try {
      await takeSnapshot(`snapshot_${formatSnapshotTimestamp()}_auto`);
      enforceRetentionLimit();
      if (mainWindow) mainWindow.webContents.send('snapshot-taken');
    } catch (e) {
      console.error('Auto-snapshot failed:', e.message);
    }
  }, autoSnapshotMinutes * 60 * 1000);
}

function stopAutoSnapshot() {
  if (autoSnapshotInterval) {
    clearInterval(autoSnapshotInterval);
    autoSnapshotInterval = null;
  }
  autoSnapshotEnabled = false;
  saveSettings();
}

ipcMain.handle('start-auto-snapshot', (event, minutes) => {
  startAutoSnapshot(minutes);
  return true;
});

ipcMain.handle('stop-auto-snapshot', () => {
  stopAutoSnapshot();
  return true;
});

ipcMain.handle('set-auto-snapshot-interval', (event, minutes) => {
  autoSnapshotMinutes = minutes;
  saveSettings();
  if (autoSnapshotInterval) {
    startAutoSnapshot(); // restart with new interval
  }
  return true;
});

ipcMain.handle('get-auto-snapshot-settings', () => {
  return { enabled: autoSnapshotEnabled, minutes: autoSnapshotMinutes };
});

// --- Test defaults persistence ---
ipcMain.handle('get-test-defaults', () => testDefaults);

ipcMain.handle('set-test-defaults', (event, tests) => {
  testDefaults = { ...testDefaults, ...tests };
  saveSettings();
  return true;
});

// --- Data folder management ---
ipcMain.handle('get-data-folder', () => getSnapshotDir());

ipcMain.handle('open-data-folder', async () => {
  const dir = getSnapshotDir();
  await shell.openPath(dir);
  return true;
});

ipcMain.handle('move-data-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select new data folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

  const newDir = result.filePaths[0];
  const oldDir = getSnapshotDir();

  if (newDir === oldDir) return { success: true, path: newDir };

  try {
    // Ensure the new directory exists
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }

    // Move all snapshot JSON files from old to new
    const files = fs.readdirSync(oldDir).filter(f => f.endsWith('.json') && f !== '_snapshot_settings.json');
    for (const file of files) {
      const src = path.join(oldDir, file);
      const dest = path.join(newDir, file);
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    }

    customSnapshotDir = newDir;
    saveSettings();

    // Open the new folder in file explorer
    await shell.openPath(newDir);

    return { success: true, path: newDir };
  } catch (e) {
    console.error('Error moving data folder:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('reset-data-folder', async () => {
  customSnapshotDir = null;
  saveSettings();
  return { success: true, path: app.getPath('userData') };
});

// --- App Installation Checker ---

/**
 * Checks whether a specific application appears to be installed on this system.
 * Works cross-platform: Windows (win32), macOS (darwin), Linux.
 *
 * @param {string} appName  - Human-readable name of the app (e.g. "Slack")
 * @param {object} hints    - Optional hints to improve detection accuracy:
 *   hints.executableNames    {string[]}  Executable names to probe with which/where
 *   hints.macBundleId        {string}    macOS bundle ID (e.g. "com.tinyspeck.slackmacgap")
 *   hints.macAppName         {string}    .app bundle name (e.g. "Slack.app")
 *   hints.windowsBundleId    {string}    Registry display name substring to search
 *   hints.linuxPackageNames  {string[]}  Package names for dpkg/rpm/pacman
 *   hints.installPaths       {string[]}  Explicit filesystem paths to check (supports ~)
 *
 * @returns {Promise<object>} { app_name, installed, confidence, signals_found,
 *                              signals_checked, found_paths, signals, platform, checked_at }
 */
async function checkAppInstalled(appName, hints = {}) {
  const platform = os.platform(); // 'win32' | 'darwin' | 'linux'
  const signals = [];
  const foundPaths = [];
  let installedSignals = 0;
  let totalSignals = 0;

  function safeExec(cmd, opts = {}) {
    try {
      return execSync(cmd, {
        timeout: 6000,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...opts,
      }).toString().trim();
    } catch {
      return null;
    }
  }

  function pathExists(p) {
    try { return fs.existsSync(p); } catch { return false; }
  }

  function record(signal) {
    signals.push(signal);
    totalSignals++;
    if (signal.found) {
      installedSignals++;
      if (signal.path) foundPaths.push(signal.path);
    }
  }

  // ── 1. Explicit install paths (all platforms) ──────────────────────────────
  for (const rawPath of (hints.installPaths || [])) {
    const p = rawPath.replace(/^~/, os.homedir());
    record({ type: 'explicit_path', found: pathExists(p), path: p });
  }

  // ── 2. Executable on PATH (all platforms) ──────────────────────────────────
  const whichCmd = platform === 'win32' ? 'where' : 'which';
  const execNames = hints.executableNames || [appName.toLowerCase()];
  for (const exe of execNames) {
    const result = safeExec(`${whichCmd} ${exe}`);
    const resolved = result ? result.split('\n')[0] : null;
    record({ type: 'executable_on_path', found: !!resolved, executable: exe, path: resolved });
  }

  // ── 3. macOS-specific checks ───────────────────────────────────────────────
  if (platform === 'darwin') {
    const macAppName = hints.macAppName || `${appName}.app`;

    // /Applications and ~/Applications
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      const ap = path.join(base, macAppName);
      record({ type: 'macos_app_bundle', found: pathExists(ap), path: ap });
    }

    // Spotlight lookup by bundle ID
    if (hints.macBundleId) {
      const found = safeExec(`mdfind "kMDItemCFBundleIdentifier == '${hints.macBundleId}'"`)
        ?.split('\n')[0] || null;
      record({ type: 'macos_bundle_id', found: !!found, bundleId: hints.macBundleId, path: found });
    }

    // Spotlight lookup by display name
    const byName = safeExec(
      `mdfind "kMDItemKind == 'Application' && kMDItemDisplayName == '${appName}'"`,
    )?.split('\n')[0] || null;
    record({ type: 'macos_spotlight_name', found: !!byName, path: byName });
  }

  // ── 4. Windows-specific checks ─────────────────────────────────────────────
  if (platform === 'win32') {
    const searchTerm = hints.windowsBundleId || appName;

    // Registry uninstall keys (system-wide, WOW64, and per-user)
    const regKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    for (const key of regKeys) {
      const out = safeExec(`reg query "${key}" /s /f "${searchTerm}" /d`);
      record({ type: 'windows_registry', found: !!(out && out.includes(searchTerm)), key });
    }

    // Common install directories
    const bases = [
      process.env['ProgramFiles']        || 'C:\\Program Files',
      process.env['ProgramFiles(x86)']   || 'C:\\Program Files (x86)',
      process.env['LOCALAPPDATA']        || path.join(os.homedir(), 'AppData', 'Local'),
    ];
    for (const base of bases) {
      const p = path.join(base, appName);
      record({ type: 'windows_install_dir', found: pathExists(p), path: p });
    }

    // MSIX / UWP via PowerShell Get-AppxPackage
    const psOut = safeExec(
      `powershell -NoProfile -Command "Get-AppxPackage *${appName}* | ` +
      `Select-Object -First 1 -ExpandProperty Name"`,
      { timeout: 12000 },
    );
    record({ type: 'windows_appx_package', found: !!psOut, packageName: psOut });
  }

  // ── 5. Linux-specific checks ───────────────────────────────────────────────
  if (platform === 'linux') {
    const pkgNames = hints.linuxPackageNames || [appName.toLowerCase()];

    for (const pkg of pkgNames) {
      // dpkg (Debian/Ubuntu)
      const dpkg = safeExec(`dpkg -s ${pkg} 2>/dev/null | grep -E "^Status:"`);
      if (dpkg?.includes('installed')) {
        record({ type: 'linux_dpkg', found: true, package: pkg });
        continue;
      }
      // rpm (Fedora/RHEL/openSUSE)
      const rpm = safeExec(`rpm -q ${pkg} 2>/dev/null`);
      if (rpm && !rpm.includes('not installed')) {
        record({ type: 'linux_rpm', found: true, package: pkg });
        continue;
      }
      // pacman (Arch)
      const pacman = safeExec(`pacman -Qi ${pkg} 2>/dev/null`);
      if (pacman) {
        record({ type: 'linux_pacman', found: true, package: pkg });
        continue;
      }
      record({ type: 'linux_package_manager', found: false, package: pkg });
    }

    // Common binary/install locations
    const lcName = appName.toLowerCase();
    for (const p of [
      `/usr/bin/${lcName}`,
      `/usr/local/bin/${lcName}`,
      `/opt/${lcName}`,
      `/opt/${appName}`,
      `/snap/bin/${lcName}`,
    ]) {
      record({ type: 'linux_install_path', found: pathExists(p), path: p });
    }

    // Flatpak
    const flatpak = safeExec(`flatpak list --app --columns=application 2>/dev/null | grep -i "${lcName}"`);
    record({ type: 'linux_flatpak', found: !!flatpak, match: flatpak?.split('\n')[0] || null });

    // Snap
    const snap = safeExec(`snap list 2>/dev/null | grep -i "${lcName}"`);
    record({ type: 'linux_snap', found: !!snap, match: snap?.split('\n')[0] || null });
  }

  // ── 6. Determine overall verdict and confidence ───────────────────────────
  const installed = installedSignals > 0;
  let confidence;
  if (installedSignals === 0) {
    confidence = 'none';        // No evidence of installation
  } else if (installedSignals >= 2) {
    confidence = 'high';        // Multiple independent signals agree
  } else {
    confidence = 'low';         // Only one signal found — possible but uncertain
  }

  return {
    app_name: appName,
    installed,
    confidence,          // 'high' | 'low' | 'none'
    signals_found: installedSignals,
    signals_checked: totalSignals,
    found_paths: [...new Set(foundPaths)],
    signals,             // Full signal-by-signal breakdown
    platform,
    checked_at: new Date().toISOString(),
  };
}

// IPC: Check a single app
// Usage: ipcRenderer.invoke('check-app-installed', 'Slack', { macBundleId: 'com.tinyspeck.slackmacgap' })
ipcMain.handle('check-app-installed', async (event, appName, hints) => {
  try {
    return await checkAppInstalled(appName, hints || {});
  } catch (e) {
    console.error('Error checking app installation:', e);
    return { app_name: appName, installed: false, confidence: 'none', error: e.message };
  }
});

// IPC: Check multiple apps in parallel
// Usage: ipcRenderer.invoke('check-apps-installed', [{ name: 'Slack', hints: {} }, { name: 'Zoom' }])
ipcMain.handle('check-apps-installed', async (event, apps) => {
  try {
    return await Promise.all(
      (apps || []).map(({ name, hints }) => checkAppInstalled(name, hints || {}))
    );
  } catch (e) {
    console.error('Error checking apps installation:', e);
    return [];
  }
});

// 3. Run the app and test our function
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  // Resume auto-snapshot if it was enabled before shutdown
  if (autoSnapshotEnabled) {
    startAutoSnapshot(autoSnapshotMinutes);
  }
});

