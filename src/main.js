const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');

// The app is CPU-bound and doesn't need GPU overlays; disabling hardware acceleration
// avoids noisy mailbox/overlay warnings on some macOS systems.
app.disableHardwareAcceleration();

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

function safeListDirectoryEntries(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    return fs.readdirSync(dirPath)
      .filter(entry => !entry.startsWith('.'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function listInstalledApplications() {
  const candidates = [
    '/Applications',
    '/System/Applications',
    path.join(os.homedir(), 'Applications'),
  ];

  const seen = new Set();
  const applications = [];

  candidates.forEach(dirPath => {
    safeListDirectoryEntries(dirPath)
      .filter(entry => entry.endsWith('.app'))
      .forEach(entry => {
        if (seen.has(entry)) {
          return;
        }
        seen.add(entry);
        applications.push({
          name: entry.replace(/\.app$/i, ''),
          source: dirPath,
        });
      });
  });

  return applications.sort((a, b) => a.name.localeCompare(b.name));
}

function listStartupArtifacts() {
  const folders = [
    { scope: 'user-launch-agents', path: path.join(os.homedir(), 'Library', 'LaunchAgents') },
    { scope: 'system-launch-agents', path: '/Library/LaunchAgents' },
    { scope: 'system-launch-daemons', path: '/Library/LaunchDaemons' },
  ];

  return folders.map(folder => ({
    scope: folder.scope,
    path: folder.path,
    items: safeListDirectoryEntries(folder.path).filter(entry => entry.endsWith('.plist')),
  }));
}

function listLaunchctlServices() {
  try {
    const output = execFileSync('launchctl', ['list'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    return output
      .split('\n')
      .slice(1)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(/\s+/);
        return parts[parts.length - 1];
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function flattenStartupArtifacts(artifacts = []) {
  return artifacts.flatMap(folder => {
    const items = Array.isArray(folder.items) ? folder.items : [];
    return items.map(item => ({
      scope: folder.scope,
      folderPath: folder.path,
      name: item,
      key: `${folder.scope}:${item}`,
    }));
  });
}

function flattenFilesystemAudit(entries = []) {
  return entries.flatMap(group => {
    const groupEntries = Array.isArray(group.entries) ? group.entries : [];
    return groupEntries.map(entry => ({
      ...entry,
      key: entry.path,
      scope: group.scope,
      root_path: group.root_path,
    }));
  });
}

function formatPathForAudit(filePath) {
  return filePath.replace(/\/+/g, '/');
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function safeReadFileHash(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) {
      return null;
    }

    const allowedExtensions = new Set(['.plist', '.json', '.txt', '.xml', '.sh', '.command', '.pkginfo']);
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return null;
    }

    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

function scanFilesystemAuditPath(dirPath, scope) {
  const stat = safeStat(dirPath);
  if (!stat || !stat.isDirectory()) {
    return null;
  }

  const entries = [];
  let rawEntries = [];

  try {
    rawEntries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  rawEntries
    .filter(entry => !entry.name.startsWith('.'))
    .slice(0, 200)
    .forEach(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const entryStat = safeStat(fullPath);
      if (!entryStat) {
        return;
      }

      const item = {
        scope,
        root_path: formatPathForAudit(dirPath),
        path: formatPathForAudit(fullPath),
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size_bytes: entryStat.size,
        mtime_ms: Math.round(entryStat.mtimeMs),
        hash: entry.isFile() ? safeReadFileHash(fullPath) : null,
      };

      entries.push(item);
    });

  return {
    scope,
    root_path: formatPathForAudit(dirPath),
    entry_count: entries.length,
    entries,
  };
}

function collectFilesystemAudit() {
  const targets = [
    { scope: 'applications', path: '/Applications' },
    { scope: 'system-applications', path: '/System/Applications' },
    { scope: 'user-applications', path: path.join(os.homedir(), 'Applications') },
    { scope: 'launch-agents-user', path: path.join(os.homedir(), 'Library', 'LaunchAgents') },
    { scope: 'launch-agents-system', path: '/Library/LaunchAgents' },
    { scope: 'launch-daemons', path: '/Library/LaunchDaemons' },
    { scope: 'desktop', path: path.join(os.homedir(), 'Desktop') },
    { scope: 'documents', path: path.join(os.homedir(), 'Documents') },
    { scope: 'downloads', path: path.join(os.homedir(), 'Downloads') },
  ];

  return targets
    .map(target => scanFilesystemAuditPath(target.path, target.scope))
    .filter(Boolean);
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
    software:  tests.software  ?? true,
    startup:   tests.startup   ?? true,
    filesystem: tests.filesystem ?? true,
  };

  console.log('Tests to run:', run);
  const startedAt = Date.now();
  updateAgentStatus({
    mode: 'snapshot',
    currentTask: filename,
    lastError: null,
  });

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
    console.log('Fetching installed applications...');
    const installedApplications = run.software ? listInstalledApplications() : [];
    console.log('Fetching startup artifacts...');
    const startupArtifacts = run.startup ? listStartupArtifacts() : [];
    console.log('Fetching launchctl services...');
    const launchctlServices = run.startup ? listLaunchctlServices() : [];
    console.log('Fetching filesystem audit...');
    const filesystemAudit = run.filesystem ? collectFilesystemAudit() : [];

    // Format it into a comprehensive JSON object
    const snapshotData = {
      metadata: {
        snapshot_name: filename,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        snapshot_version: '2.2',
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
      })),
      software: {
        installed_applications: installedApplications,
        launchctl_services: launchctlServices,
      },
      startup: {
        launch_agents: startupArtifacts,
      },
      filesystem_audit: filesystemAudit,
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
    updateAgentStatus({
      mode: 'idle',
      currentTask: null,
      lastTask: `Snapshot ${filename}`,
      lastRunAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      lastError: null,
    });
    return signedSnapshot;

  } catch (e) {
    console.error("Error taking snapshot:", e.message);
    console.error(e.stack);
    updateAgentStatus({
      mode: 'error',
      currentTask: null,
      lastTask: `Snapshot ${filename}`,
      lastRunAt: new Date().toISOString(),
      lastDurationMs: Date.now() - startedAt,
      lastError: e.message,
    });
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

ipcMain.handle('get-agent-status', async () => {
  return agentStatus;
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
    return buildComparisonAnalysis(baselineName, afterName);
  } catch (e) {
    console.error("Error comparing snapshots:", e);
    return null;
  }
});

ipcMain.handle('generate-comparison-report', async (event, baselineName, afterName) => {
  try {
    return await exportComparisonReport(baselineName, afterName);
  } catch (e) {
    console.error('Error generating comparison report:', e);
    return { success: false, error: e.message };
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
    updateAgentStatus({
      mode: 'uploading',
      currentTask: filename,
      lastError: null,
    });
    const serverUrl = resolveSnapshotServerUrl();
    const apiKey = HARDCODED_SNAPSHOT_API_KEY;
    if (!serverUrl) {
      updateAgentStatus({
        mode: 'error',
        currentTask: null,
        lastTask: `Upload ${filename}`,
        lastRunAt: new Date().toISOString(),
        lastDurationMs: null,
        lastError: 'Hardcoded snapshot server URL is invalid or points to localhost.',
      });
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
      updateAgentStatus({
        mode: 'idle',
        currentTask: null,
        lastTask: `Upload ${filename}`,
        lastRunAt: new Date().toISOString(),
        lastDurationMs: null,
        lastError: null,
      });
      return { success: true, id: result.body?.id || null };
    }

    updateAgentStatus({
      mode: 'error',
      currentTask: null,
      lastTask: `Upload ${filename}`,
      lastRunAt: new Date().toISOString(),
      lastDurationMs: null,
      lastError: result.body?.message || result.body?.error || `HTTP ${result.status}`,
    });
    return { success: false, error: result.body?.message || result.body?.error || `HTTP ${result.status}` };
  } catch (e) {
    console.error('Error uploading snapshot:', e);
    updateAgentStatus({
      mode: 'error',
      currentTask: null,
      lastTask: `Upload ${filename}`,
      lastRunAt: new Date().toISOString(),
      lastDurationMs: null,
      lastError: e.message,
    });
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
let testDefaults = { cpu: true, memory: true, processes: true, network: true, disk: true, users: true, software: true, startup: true };
let customSnapshotDir = null; // null = use default userData path
let agentStatus = {
  mode: 'idle',
  currentTask: null,
  lastTask: null,
  lastRunAt: null,
  lastDurationMs: null,
  lastError: null,
  host: os.hostname(),
  platform: process.platform,
  nodeVersion: process.versions.node,
};

function updateAgentStatus(patch) {
  agentStatus = { ...agentStatus, ...patch };
  if (mainWindow) {
    mainWindow.webContents.send('agent-status-updated', agentStatus);
  }
}

function readSnapshotData(filename) {
  const snapshotPath = path.join(getSnapshotDir(), `${filename}.json`);
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
}

function formatComparisonDelta(value, unit = '') {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return `0${unit}`;
  }

  const prefix = normalized > 0 ? '+' : '';
  const rendered = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(2);
  return `${prefix}${rendered}${unit}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildComparisonAnalysis(baselineName, afterName) {
  const baseline = readSnapshotData(baselineName);
  const after = readSnapshotData(afterName);

  const baselineProcesses = baseline.running_processes || [];
  const afterProcesses = after.running_processes || [];
  const baselineProcessNames = new Set(baselineProcesses.map(p => p.name));
  const afterProcessNames = new Set(afterProcesses.map(p => p.name));

  const baselineApps = baseline.software?.installed_applications || [];
  const afterApps = after.software?.installed_applications || [];
  const baselineAppNames = new Set(baselineApps.map(app => app.name));
  const afterAppNames = new Set(afterApps.map(app => app.name));

  const baselineStartupItems = flattenStartupArtifacts(baseline.startup?.launch_agents || []);
  const afterStartupItems = flattenStartupArtifacts(after.startup?.launch_agents || []);
  const baselineStartupKeys = new Set(baselineStartupItems.map(item => item.key));
  const afterStartupKeys = new Set(afterStartupItems.map(item => item.key));

  const baselineFilesystemItems = flattenFilesystemAudit(baseline.filesystem_audit || []);
  const afterFilesystemItems = flattenFilesystemAudit(after.filesystem_audit || []);
  const baselineFilesystemKeys = new Set(baselineFilesystemItems.map(item => item.key));
  const afterFilesystemKeys = new Set(afterFilesystemItems.map(item => item.key));

  const newProcesses = afterProcesses.filter(p => !baselineProcessNames.has(p.name));
  const removedProcesses = baselineProcesses.filter(p => !afterProcessNames.has(p.name));
  const newApplications = afterApps.filter(app => !baselineAppNames.has(app.name));
  const removedApplications = baselineApps.filter(app => !afterAppNames.has(app.name));
  const newStartupItems = afterStartupItems.filter(item => !baselineStartupKeys.has(item.key));
  const removedStartupItems = baselineStartupItems.filter(item => !afterStartupKeys.has(item.key));
  const newFilesystemItems = afterFilesystemItems.filter(item => !baselineFilesystemKeys.has(item.key));
  const removedFilesystemItems = baselineFilesystemItems.filter(item => !afterFilesystemKeys.has(item.key));
  const modifiedFilesystemItems = afterFilesystemItems
    .map(afterItem => {
      const baselineItem = baselineFilesystemItems.find(item => item.key === afterItem.key);
      if (!baselineItem) {
        return null;
      }

      const hashChanged = baselineItem.hash && afterItem.hash && baselineItem.hash !== afterItem.hash;
      const sizeChanged = baselineItem.size_bytes !== afterItem.size_bytes;
      const mtimeChanged = baselineItem.mtime_ms !== afterItem.mtime_ms;

      if (!hashChanged && !sizeChanged && !mtimeChanged) {
        return null;
      }

      return {
        ...afterItem,
        hash_changed: hashChanged,
        size_changed: sizeChanged,
        mtime_changed: mtimeChanged,
        baseline_size_bytes: baselineItem.size_bytes,
        baseline_mtime_ms: baselineItem.mtime_ms,
      };
    })
    .filter(Boolean);

  const processChanges = afterProcesses
    .map(afterProc => {
      const baselineProc = baselineProcesses.find(p => p.name === afterProc.name);
      if (!baselineProc) {
        return null;
      }

      return {
        name: afterProc.name,
        cpu_change: afterProc.cpu_usage - baselineProc.cpu_usage,
        mem_change: afterProc.mem_usage - baselineProc.mem_usage,
        cpu_before: baselineProc.cpu_usage,
        cpu_after: afterProc.cpu_usage,
        mem_before: baselineProc.mem_usage,
        mem_after: afterProc.mem_usage,
      };
    })
    .filter(p => p && (Math.abs(p.cpu_change) > 0.5 || Math.abs(p.mem_change) > 0.5));

  const baselinePorts = baseline.network?.listening_ports || [];
  const afterPorts = after.network?.listening_ports || [];
  const newListeningPorts = afterPorts.filter(
    p => !baselinePorts.some(bp => bp.local_port === p.local_port && bp.protocol === p.protocol)
  );

  const memoryChangeGb = Number((parseFloat(after.system?.used_memory_gb || '0') - parseFloat(baseline.system?.used_memory_gb || '0')).toFixed(2));

  const concerns = [];
  if (newListeningPorts.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newListeningPorts.length} new listening port${newListeningPorts.length === 1 ? '' : 's'} detected`,
      detail: newListeningPorts.slice(0, 5).map(port => `${port.protocol} ${port.local_address}:${port.local_port} (${port.process_name || 'unknown'})`).join(' • '),
    });
  }

  if (removedProcesses.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedProcesses.length} process${removedProcesses.length === 1 ? '' : 'es'} disappeared`,
      detail: removedProcesses.slice(0, 5).map(proc => `${proc.name} (pid ${proc.pid})`).join(' • '),
    });
  }

  if (newApplications.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newApplications.length} new application${newApplications.length === 1 ? '' : 's'} detected`,
      detail: newApplications.slice(0, 8).map(app => `${app.name} (${app.source})`).join(' • '),
    });
  }

  if (newStartupItems.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newStartupItems.length} new startup item${newStartupItems.length === 1 ? '' : 's'} detected`,
      detail: newStartupItems.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  if (removedApplications.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedApplications.length} application${removedApplications.length === 1 ? '' : 's'} removed`,
      detail: removedApplications.slice(0, 8).map(app => `${app.name} (${app.source})`).join(' • '),
    });
  }

  if (removedStartupItems.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedStartupItems.length} startup item${removedStartupItems.length === 1 ? '' : 's'} removed`,
      detail: removedStartupItems.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  const highSignalFileChanges = newFilesystemItems.filter(item => /^(launch-agents|launch-daemons|user-applications|system-applications|applications)/.test(item.scope));
  const highSignalModifiedFiles = modifiedFilesystemItems.filter(item => /^(launch-agents|launch-daemons|user-applications|system-applications|applications)/.test(item.scope));

  if (highSignalFileChanges.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${highSignalFileChanges.length} filesystem item${highSignalFileChanges.length === 1 ? '' : 's'} added in high-signal locations`,
      detail: highSignalFileChanges.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  if (highSignalModifiedFiles.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${highSignalModifiedFiles.length} filesystem item${highSignalModifiedFiles.length === 1 ? '' : 's'} changed in high-signal locations`,
      detail: highSignalModifiedFiles.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  const installerLikeFiles = newFilesystemItems.filter(item => /^(desktop|documents|downloads)/.test(item.scope) && /\.(pkg|dmg|zip|app|command|sh|pkginfo)$/i.test(item.name));
  if (installerLikeFiles.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${installerLikeFiles.length} likely installer artifact${installerLikeFiles.length === 1 ? '' : 's'} detected`,
      detail: installerLikeFiles.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  const notableProcessChanges = processChanges.filter(change => Math.abs(change.cpu_change) >= 15 || Math.abs(change.mem_change) >= 10);
  if (notableProcessChanges.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${notableProcessChanges.length} process${notableProcessChanges.length === 1 ? '' : 'es'} changed resource usage significantly`,
      detail: notableProcessChanges.slice(0, 5).map(change => `${change.name}: CPU ${formatComparisonDelta(change.cpu_change, '%')}, MEM ${formatComparisonDelta(change.mem_change, '%')}`).join(' • '),
    });
  }

  if (Math.abs(memoryChangeGb) >= 1) {
    concerns.push({
      severity: 'medium',
      title: `System memory usage changed by ${formatComparisonDelta(memoryChangeGb, ' GB')}`,
      detail: `Used memory moved from ${baseline.system?.used_memory_gb || '0'} GB to ${after.system?.used_memory_gb || '0'} GB.`,
    });
  }

  const highestSeverity = concerns.some(item => item.severity === 'high')
    ? 'high'
    : concerns.some(item => item.severity === 'medium')
      ? 'medium'
      : 'low';

  const summary = concerns.length === 0
    ? 'No major concerns detected.'
    : highestSeverity === 'high'
      ? 'Review the highlighted network and process changes before treating this snapshot pair as stable.'
      : 'The comparison shows moderate changes that are worth a quick review.';

  return {
    baseline_name: baselineName,
    after_name: afterName,
    baseline_timestamp: baseline.metadata?.timestamp,
    after_timestamp: after.metadata?.timestamp,
    time_diff_minutes: Number.isFinite(new Date(after.metadata?.timestamp).getTime()) && Number.isFinite(new Date(baseline.metadata?.timestamp).getTime())
      ? Math.round((new Date(after.metadata?.timestamp) - new Date(baseline.metadata?.timestamp)) / 60000)
      : 0,
    new_processes: newProcesses,
    removed_processes: removedProcesses,
    new_applications: newApplications,
    removed_applications: removedApplications,
    new_startup_items: newStartupItems,
    removed_startup_items: removedStartupItems,
    new_filesystem_items: newFilesystemItems,
    removed_filesystem_items: removedFilesystemItems,
    modified_filesystem_items: modifiedFilesystemItems,
    process_changes: processChanges,
    memory_change_gb: memoryChangeGb.toFixed(2),
    new_listening_ports: newListeningPorts,
    concerns,
    concern_summary: {
      level: highestSeverity,
      text: summary,
    },
  };
}

function buildComparisonReportHtml(analysis) {
  const concernRows = analysis.concerns.length > 0
    ? analysis.concerns.map(item => `
        <div class="report-concern report-${item.severity}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail || '')}</span>
        </div>
      `).join('')
    : '<div class="report-empty">No major concerns detected.</div>';

  const newProcessRows = analysis.new_processes.length > 0
    ? analysis.new_processes.slice(0, 20).map(proc => `<li>${escapeHtml(proc.name)} <span>pid ${escapeHtml(proc.pid)}</span></li>`).join('')
    : '<li>No new processes detected.</li>';

  const removedProcessRows = analysis.removed_processes.length > 0
    ? analysis.removed_processes.slice(0, 20).map(proc => `<li>${escapeHtml(proc.name)} <span>pid ${escapeHtml(proc.pid)}</span></li>`).join('')
    : '<li>No removed processes detected.</li>';

  const newApplicationRows = analysis.new_applications.length > 0
    ? analysis.new_applications.slice(0, 20).map(app => `<li>${escapeHtml(app.name)} <span>${escapeHtml(app.source)}</span></li>`).join('')
    : '<li>No new applications detected.</li>';

  const removedApplicationRows = analysis.removed_applications.length > 0
    ? analysis.removed_applications.slice(0, 20).map(app => `<li>${escapeHtml(app.name)} <span>${escapeHtml(app.source)}</span></li>`).join('')
    : '<li>No removed applications detected.</li>';

  const newStartupRows = analysis.new_startup_items.length > 0
    ? analysis.new_startup_items.slice(0, 20).map(item => `<li>${escapeHtml(item.name)} <span>${escapeHtml(item.scope)}</span></li>`).join('')
    : '<li>No new startup items detected.</li>';

  const removedStartupRows = analysis.removed_startup_items.length > 0
    ? analysis.removed_startup_items.slice(0, 20).map(item => `<li>${escapeHtml(item.name)} <span>${escapeHtml(item.scope)}</span></li>`).join('')
    : '<li>No removed startup items detected.</li>';

  const newFilesystemRows = analysis.new_filesystem_items.length > 0
    ? analysis.new_filesystem_items.slice(0, 20).map(item => `<li>${escapeHtml(item.name)} <span>${escapeHtml(item.scope)} • ${escapeHtml(item.type)}</span></li>`).join('')
    : '<li>No new filesystem items detected.</li>';

  const removedFilesystemRows = analysis.removed_filesystem_items.length > 0
    ? analysis.removed_filesystem_items.slice(0, 20).map(item => `<li>${escapeHtml(item.name)} <span>${escapeHtml(item.scope)} • ${escapeHtml(item.type)}</span></li>`).join('')
    : '<li>No removed filesystem items detected.</li>';

  const modifiedFilesystemRows = analysis.modified_filesystem_items.length > 0
    ? analysis.modified_filesystem_items.slice(0, 20).map(item => `<li>${escapeHtml(item.name)} <span>${escapeHtml(item.scope)} • ${escapeHtml(item.type)}${item.hash_changed ? ' • hash changed' : ''}${item.size_changed ? ' • size changed' : ''}${item.mtime_changed ? ' • mtime changed' : ''}</span></li>`).join('')
    : '<li>No modified filesystem items detected.</li>';

  const processChangeRows = analysis.process_changes.length > 0
    ? analysis.process_changes.slice(0, 30).map(change => `<li>${escapeHtml(change.name)} <span>CPU ${formatComparisonDelta(change.cpu_change, '%')} • MEM ${formatComparisonDelta(change.mem_change, '%')}</span></li>`).join('')
    : '<li>No notable process resource changes.</li>';

  const portRows = analysis.new_listening_ports.length > 0
    ? analysis.new_listening_ports.slice(0, 20).map(port => `<li>${escapeHtml(port.protocol)} ${escapeHtml(port.local_address)}:${escapeHtml(port.local_port)} <span>${escapeHtml(port.process_name || 'unknown')}</span></li>`).join('')
    : '<li>No new listening ports detected.</li>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 18mm; }
    :root {
      color-scheme: dark;
      --bg: #0a0a0a;
      --surface: #111111;
      --surface-2: #1a1a1a;
      --surface-3: #222222;
      --text: #ffffff;
      --text-2: #aaaaaa;
      --border: rgba(255, 255, 255, 0.08);
      --good: #dddddd;
      --warning: #cccccc;
      --danger: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Poppins', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .page {
      padding: 0;
    }
    .hero {
      border: 1px solid var(--border);
      background: linear-gradient(180deg, var(--surface), var(--surface-2));
      border-radius: 18px;
      padding: 22px;
      margin-bottom: 16px;
    }
    .eyebrow {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-2);
      margin-bottom: 8px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta {
      color: var(--text-2);
      font-size: 13px;
      line-height: 1.6;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .summary-card, .section {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 16px;
      padding: 16px;
    }
    .summary-card .label, .section h2, .section h3 {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-2);
      margin-bottom: 8px;
    }
    .summary-card .value {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .summary-card .subtle {
      color: var(--text-2);
      font-size: 12px;
    }
    .section {
      margin-bottom: 14px;
    }
    .section h2 {
      font-size: 11px;
      margin-bottom: 12px;
    }
    .concerns {
      display: grid;
      gap: 10px;
    }
    .report-concern, .report-empty {
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      padding: 12px 14px;
    }
    .report-concern strong {
      display: block;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .report-concern span, .report-empty {
      color: var(--text-2);
      font-size: 12px;
      line-height: 1.5;
    }
    .report-high { border-left: 3px solid var(--danger); }
    .report-medium { border-left: 3px solid var(--warning); }
    .report-low { border-left: 3px solid var(--good); }
    ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
      color: var(--text);
    }
    li span {
      display: block;
      color: var(--text-2);
      font-size: 12px;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div class="eyebrow">Snapshot comparison report</div>
      <h1>${escapeHtml(analysis.baseline_name)} → ${escapeHtml(analysis.after_name)}</h1>
      <div class="meta">Baseline: ${escapeHtml(analysis.baseline_timestamp || '-')}<br/>After: ${escapeHtml(analysis.after_timestamp || '-')}<br/>Elapsed: ${escapeHtml(analysis.time_diff_minutes)} minutes</div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="label">Risk</div><div class="value">${escapeHtml(analysis.concern_summary.level.toUpperCase())}</div><div class="subtle">${escapeHtml(analysis.concern_summary.text)}</div></div>
      <div class="summary-card"><div class="label">New Processes</div><div class="value">${analysis.new_processes.length}</div><div class="subtle">Processes that appeared in the after snapshot.</div></div>
      <div class="summary-card"><div class="label">Removed Processes</div><div class="value">${analysis.removed_processes.length}</div><div class="subtle">Processes that disappeared from the after snapshot.</div></div>
      <div class="summary-card"><div class="label">New Apps</div><div class="value">${analysis.new_applications.length}</div><div class="subtle">New software discovered in the app inventory.</div></div>
      <div class="summary-card"><div class="label">Startup Items</div><div class="value">${analysis.new_startup_items.length}</div><div class="subtle">New persistence artifacts registered at startup.</div></div>
      <div class="summary-card"><div class="label">File Adds</div><div class="value">${analysis.new_filesystem_items.length}</div><div class="subtle">New filesystem items in monitored install locations.</div></div>
      <div class="summary-card"><div class="label">File Mods</div><div class="value">${analysis.modified_filesystem_items.length}</div><div class="subtle">Modified files or directories in monitored locations.</div></div>
      <div class="summary-card"><div class="label">Memory Delta</div><div class="value">${escapeHtml(analysis.memory_change_gb)} GB</div><div class="subtle">Change in used system memory between snapshots.</div></div>
    </div>

    <div class="section">
      <h2>Concerns</h2>
      <div class="concerns">
        ${concernRows}
      </div>
    </div>

    <div class="section">
      <h2>New Processes</h2>
      <ul>${newProcessRows}</ul>
    </div>

    <div class="section">
      <h2>Removed Processes</h2>
      <ul>${removedProcessRows}</ul>
    </div>

    <div class="section">
      <h2>New Applications</h2>
      <ul>${newApplicationRows}</ul>
    </div>

    <div class="section">
      <h2>Removed Applications</h2>
      <ul>${removedApplicationRows}</ul>
    </div>

    <div class="section">
      <h2>New Startup Items</h2>
      <ul>${newStartupRows}</ul>
    </div>

    <div class="section">
      <h2>Removed Startup Items</h2>
      <ul>${removedStartupRows}</ul>
    </div>

    <div class="section">
      <h2>New Filesystem Items</h2>
      <ul>${newFilesystemRows}</ul>
    </div>

    <div class="section">
      <h2>Removed Filesystem Items</h2>
      <ul>${removedFilesystemRows}</ul>
    </div>

    <div class="section">
      <h2>Modified Filesystem Items</h2>
      <ul>${modifiedFilesystemRows}</ul>
    </div>

    <div class="section">
      <h2>Process Changes</h2>
      <ul>${processChangeRows}</ul>
    </div>

    <div class="section">
      <h2>New Listening Ports</h2>
      <ul>${portRows}</ul>
    </div>
  </div>
</body>
</html>`;
}

async function exportComparisonReport(baselineName, afterName) {
  const analysis = buildComparisonAnalysis(baselineName, afterName);
  const defaultName = `snapshot-report_${baselineName}_vs_${afterName}.pdf`;
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save comparison PDF report',
    defaultPath: path.join(getSnapshotDir(), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, canceled: true };
  }

  const reportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    const html = buildComparisonReportHtml(analysis);
    await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    });

    fs.writeFileSync(saveResult.filePath, pdfBuffer);
    await shell.openPath(saveResult.filePath);
    return { success: true, path: saveResult.filePath };
  } finally {
    if (!reportWindow.isDestroyed()) {
      reportWindow.close();
    }
  }
}

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

// 3. Run the app and test our function
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  // Resume auto-snapshot if it was enabled before shutdown
  if (autoSnapshotEnabled) {
    startAutoSnapshot(autoSnapshotMinutes);
  }
});

