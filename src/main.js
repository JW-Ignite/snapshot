const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain } = require('electron');
const https = require('https');
const http = require('http');

// Load .env file from the project root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_SNAPSHOT_SERVER_URL = 'http://localhost:3000';
const DEFAULT_SNAPSHOT_API_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

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
    const savePath = path.join(app.getPath('userData'), `${filename}.json`);
    console.log(`Saving to: ${savePath}`);
    
    // Ensure directory exists
    const dir = app.getPath('userData');
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
  return await takeSnapshot(filename, tests);
});

ipcMain.handle('list-snapshots', async (event) => {
  try {
    const snapshotDir = app.getPath('userData');
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json'));
    return files.map(f => f.replace('.json', ''));
  } catch (e) {
    console.error("Error listing snapshots:", e);
    return [];
  }
});

ipcMain.handle('load-snapshot', async (event, filename) => {
  try {
    const snapshotPath = path.join(app.getPath('userData'), `${filename}.json`);
    const data = fs.readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error("Error loading snapshot:", e);
    return null;
  }
});

ipcMain.handle('delete-snapshot', async (event, filename) => {
  try {
    const snapshotPath = path.join(app.getPath('userData'), `${filename}.json`);
    fs.unlinkSync(snapshotPath);
    return true;
  } catch (e) {
    console.error("Error deleting snapshot:", e);
    return false;
  }
});

ipcMain.handle('wipe-all-snapshots', async () => {
  try {
    const snapshotDir = app.getPath('userData');
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(snapshotDir, file));
    }
    return { success: true, count: files.length };
  } catch (e) {
    console.error("Error wiping snapshots:", e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-snapshot-folder', async () => {
  const { shell } = require('electron');
  const snapshotDir = app.getPath('userData');
  shell.openPath(snapshotDir);
});

ipcMain.handle('compare-snapshots', async (event, baselineName, afterName) => {
  try {
    const baselinePath = path.join(app.getPath('userData'), `${baselineName}.json`);
    const afterPath = path.join(app.getPath('userData'), `${afterName}.json`);
    
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
  let snapshotId = null;

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

  const updateSnapshotRow = async (serverUrl, apiKey, id, payload) => {
    const body = JSON.stringify(payload);
    const url = new URL(`/api/snapshots/${id}`, serverUrl);

    return makeRequest(url.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);
  };

  try {
    const serverUrl = process.env.SNAPSHOT_SERVER_URL || DEFAULT_SNAPSHOT_SERVER_URL;
    const apiKey = process.env.SNAPSHOT_API_KEY || DEFAULT_SNAPSHOT_API_KEY;
    const machineId = process.env.MACHINE_ID || require('os').hostname();
    const machineName = process.env.MACHINE_NAME || require('os').hostname();

    // Load the local snapshot
    const snapshotPath = path.join(app.getPath('userData'), `${filename}.json`);
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

    const completedData = withStatus(data, 'Completed');

    // Upload in a single POST with the full snapshot data
    const payload = {
      machine_id: machineId,
      machine_name: machineName,
      snapshot_name: filename,
      data: completedData,
    };

    const result = await createSnapshotRow(serverUrl, apiKey, payload);

    if (result.status === 200 || result.status === 201) {
      snapshotId = result.body?.id;
      return { success: true, id: snapshotId };
    }

    return { success: false, error: result.body?.error || result.body?.message || `HTTP ${result.status}` };
  } catch (e) {
    console.error('Error uploading snapshot:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-remote-snapshots', async (event) => {
  try {
    const serverUrl = process.env.SNAPSHOT_SERVER_URL || DEFAULT_SNAPSHOT_SERVER_URL;
    const apiKey = process.env.SNAPSHOT_API_KEY || DEFAULT_SNAPSHOT_API_KEY;

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

  // Take one immediately on start
  takeSnapshot(`snapshot_${formatSnapshotTimestamp()}_auto`)
    .then(() => { if (mainWindow) mainWindow.webContents.send('snapshot-taken'); })
    .catch(e => console.error('Auto-snapshot failed:', e.message));

  autoSnapshotInterval = setInterval(async () => {
    try {
      await takeSnapshot(`snapshot_${formatSnapshotTimestamp()}_auto`);
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
  if (autoSnapshotInterval) {
    startAutoSnapshot(); // restart with new interval
  }
  return true;
});

ipcMain.handle('get-auto-snapshot-settings', () => {
  return { enabled: autoSnapshotEnabled, minutes: autoSnapshotMinutes };
});

// 3. Run the app and test our function
app.whenReady().then(() => {
  createWindow();
});

