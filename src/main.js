const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain } = require('electron');
const https = require('https');
const http = require('http');

// Load .env file from the project root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
async function takeSnapshot(filename) {
  try {
    console.log(`Taking snapshot: ${filename}...`);
    
    // Grab comprehensive system data
    console.log('Fetching CPU info...');
    const cpu = await si.cpu();
    console.log('Fetching memory info...');
    const mem = await si.mem();
    console.log('Fetching processes...');
    const processes = await si.processes();
    console.log(`Found ${processes.list.length} processes`);
    
    console.log('Fetching network interfaces...');
    const networkInterfaces = await si.networkInterfaces();
    console.log('Fetching network stats...');
    const networkStats = await si.networkStats();
    console.log('Fetching open connections...');
    const networkConnections = await si.networkConnections();
    console.log('Fetching disk layout...');
    const diskLayout = await si.diskLayout();
    console.log('Fetching file system size...');
    const fsSize = await si.fsSize();
    console.log('Fetching OS info...');
    const osInfo = await si.osInfo();
    console.log('Fetching users...');
    const users = await si.users();

    // Format it into a comprehensive JSON object
    const snapshotData = {
      metadata: {
        snapshot_name: filename,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        snapshot_version: '2.0',
        data_collection_method: 'systeminformation library'
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
const createWindow = () => {
  const mainWindow = new BrowserWindow({
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
ipcMain.handle('take-snapshot', async (event, filename) => {
  return await takeSnapshot(filename);
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
  try {
    const serverUrl = process.env.SNAPSHOT_SERVER_URL;
    const apiKey = process.env.SNAPSHOT_API_KEY;
    const machineId = process.env.MACHINE_ID || require('os').hostname();
    const machineName = process.env.MACHINE_NAME || require('os').hostname();

    if (!serverUrl || !apiKey) {
      return { success: false, error: 'SNAPSHOT_SERVER_URL and SNAPSHOT_API_KEY env vars not set' };
    }

    // Load the local snapshot
    const snapshotPath = path.join(app.getPath('userData'), `${filename}.json`);
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

    const body = JSON.stringify([
      {
        machine_id: machineId,
        machine_name: machineName,
        snapshot_name: filename,
        timestamp: data.metadata?.timestamp,
        data
      }
    ]);
    const url = new URL('/rest/v1/snapshots', serverUrl);

    const result = await makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    if (result.status === 201 || result.status === 200) {
      return { success: true, id: result.body[0]?.id };
    } else {
      return { success: false, error: result.body?.message || result.body?.error || `HTTP ${result.status}` };
    }
  } catch (e) {
    console.error('Error uploading snapshot:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-remote-snapshots', async (event) => {
  try {
    const serverUrl = process.env.SNAPSHOT_SERVER_URL;
    const apiKey = process.env.SNAPSHOT_API_KEY;

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

// 3. Run the app and test our function
app.whenReady().then(() => {
  createWindow();
  
  // For testing: Let's take the "Before" snapshot immediately when the app starts
  // Commented out for now - we'll take snapshots from the UI
  // takeSnapshot('baseline_before_install');
});