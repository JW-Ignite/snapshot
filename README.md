# Snapshot Tool

A desktop application for capturing, storing, and comparing system state snapshots. Built with Electron, it provides deep visibility into your system's running processes, network configuration, and hardware info — with cryptographic signing to ensure snapshot integrity.

---

## Features

- **System Snapshots** — Capture a full point-in-time view of your system including CPU, memory, disk, OS, network interfaces, listening ports, and all running processes (900+)
- **SHA256 Integrity Signing** — Every snapshot is cryptographically signed at capture time so you can verify it hasn't been tampered with
- **Snapshot Comparison** — Diff any two snapshots to see:
  - New processes that appeared
  - Processes that were removed
  - Processes with significant CPU/memory changes
  - New listening ports opened
- **Process Search** — Real-time filter across all captured processes by name
- **Local Storage** — Snapshots are saved as JSON files in your app data directory (`~/Library/Application Support/snapshot-tool/` on macOS)

---

## Screenshots

> _Select a snapshot from the sidebar to view full system details and compare against another snapshot._

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

### Install

```bash
git clone https://github.com/karndt414/snapshot.git
cd snapshot
npm install
```

### Run

```bash
npm start
```

### Package / Build

```bash
# Package for current platform
npm run package

# Create distributable (zip, deb, rpm, squirrel)
npm run make
```

---

## Usage

1. **Take a Snapshot** — Type a name in the input field (or leave blank for a timestamped name) and click **Take New Snapshot**. Data collection takes a few seconds.
2. **View a Snapshot** — Click any snapshot in the left sidebar to load its details.
3. **Compare Snapshots** — With a snapshot loaded, select another from the **"Compare with..."** dropdown and click **Compare**.
4. **Delete a Snapshot** — Click **Delete** while a snapshot is loaded and confirm the dialog.
5. **Search Processes** — Use the search bar in the Processes section to filter by process name.

---

## Data Collected Per Snapshot

| Category | Details |
|---|---|
| CPU | Manufacturer, brand, cores, speed |
| Memory | Total, used, free (GB) |
| Operating System | Distro, release, platform, arch |
| Disk | Layout, total size |
| File System | Mount points, used/total GB, usage % |
| Network Interfaces | Name, IPv4, type (up to 5) |
| Listening Ports | Process name, protocol, port number |
| Running Processes | Name, PID, CPU %, memory % (all processes) |
| Integrity | SHA256 checksum, signed timestamp |

---

## Tech Stack

- **[Electron](https://www.electronjs.org/)** — Cross-platform desktop app framework
- **[Electron Forge](https://www.electronforge.io/)** — Build toolchain with Webpack
- **[systeminformation](https://systeminformation.io/)** — Cross-platform system data library
- **Node.js `crypto`** — SHA256 snapshot signing
- **Vanilla JS + CSS** — No UI framework dependencies

---

## Project Structure

```
snapshot-tool/
├── src/
│   ├── main.js          # Electron main process — data collection, IPC handlers
│   ├── renderer.js      # Renderer process — UI logic, event handling
│   ├── index.css        # Styles
│   ├── index.html       # HTML template
│   └── preload.js       # Preload script
├── forge.config.js      # Electron Forge configuration
├── webpack.main.config.js
├── webpack.renderer.config.js
└── package.json
```

---

## Snapshot Storage

Snapshots are stored as signed JSON files:

```
~/Library/Application Support/snapshot-tool/<name>.json   # macOS
%APPDATA%\snapshot-tool\<name>.json                        # Windows
~/.config/snapshot-tool/<name>.json                        # Linux
```

---