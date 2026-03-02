# Design Doc: Snapshot
**Version:** 1.0.0  
**Date:** March 1, 2026  
**Status:** Initial Draft

---

## 1. Team Roles & Responsibilities

To ensure the platform is robust, we've divided our efforts into four core teams:

| Team | Members and Responsibility (**Bold** indicates team lead) |
|---|---|
| Local App Development | **Jackson**, Dallas, Bryson, Sebastian, Praneeth, and Sripath — Create the main app, designates what the app does, how it does it, and the according tests. |
| Web App Development | **Wyatt**, Akshay, Arush, Krish, and Sid B. — Design the bridge between the main app and the server, create the main hub for the tests and the network between the clients. |
| UI/UX | **Sri**, Ridhima, Lizzie, and Shanmuk — Design the look and feel of the app, thinking about how the user will interpret the data and ensuring transparency. |
| Security Team | **Koree**, Sid M., Aditya, Rami, and Jag — Ensuring the app is safe and secure, and responsible for the authentication of the users across the features. |

---

## 2. Platform Overview & Objectives

The goal of Snapshot is to provide a "clean-room" environment to test how Windows applications interact with the OS during and after installation.

**Key Objectives:**
- **Transparency:** Every registry change, file addition, and background process must be logged and visible to the user.
- **Clarity:** The display of these tests must be incredibly readable to the user.
- **Scalability:** The user should be able to compare a wide range of clients, through a variety of tests.

---

## 3. The Testing Process

The platform follows a **Capture → Compare** workflow driven entirely from the desktop client:

1. **Pre-Install Baseline:** The user names and triggers a snapshot from the Electron app. The app calls the `systeminformation` library to collect a full point-in-time record of the machine.
2. **Execution:** The user installs or runs whatever software or change they want to evaluate (this happens outside the app — the app does not control or execute the installer).
3. **Post-Install Snapshot:** The user takes a second snapshot after the change is complete.
4. **Delta Comparison:** The user selects any two saved snapshots and clicks **📊 Compare**. The app calculates the delta locally, showing:
   - New processes that appeared between snapshots
   - Processes that were removed
   - Processes with significant CPU or memory changes (>0.5% threshold)
   - New network ports that opened between snapshots
5. **Integrity Verification:** Every snapshot is cryptographically signed with SHA-256 at capture time. The app displays the checksum and signing timestamp so the user can confirm data has not been tampered with.
6. **Cloud Upload (Optional):** A completed snapshot can be uploaded to the central Vercel/Supabase server with the **☁️ Upload** button, enabling cross-machine comparisons and a shared dashboard.

**Transparency Note:** All data collection is performed by the open-source `systeminformation` library. The full raw JSON for every snapshot is stored locally in the app's user data directory and can be inspected at any time.

---

## 4. Data Collected Per Snapshot

The following data categories are captured on every snapshot trigger:

| Category | Details Captured |
|---|---|
| **CPU** | Manufacturer, brand, core count, clock speed (GHz) |
| **Memory** | Total, used, and available RAM (GB) |
| **Operating System** | Platform, distro, release version, kernel, architecture |
| **Disk Layout** | Number of physical disks, total size (GB) |
| **File System** | Mount points, used/total GB, usage percentage (up to 5 mounts) |
| **Network Interfaces** | Interface name, IPv4, IPv6, MAC address, type, speed |
| **Network Stats** | Per-interface TX/RX byte and error counts |
| **Listening Ports** | Process name, PID, protocol, local address and port (up to 50) |
| **Running Processes** | Name, PID, PPID, CPU %, memory %, command, user, state, priority, virtual and resident memory — sorted by CPU usage |
| **Active Users** | Logged-in users, terminal, login date and time |
| **Integrity Block** | SHA-256 checksum of the full snapshot JSON, signing timestamp |

**Target Environments:**
The platform is designed to be OS-agnostic (macOS, Windows, Linux) via `systeminformation`. Current testing focuses on:
- VS Code — extension folder placement and CLI integration (`code .`)
- Node.js — environment variable updates and npm cache initialization
- GitHub Desktop — credential manager integration and Git-LFS setup
- Docker Desktop — WSL2/Hyper-V backend activation and memory reservation
- Discord — auto-start behavior and Local/Roaming data usage

---

## 5. Automated Evaluation Report Design

After a delta comparison is run, the app displays structured results in four panels:

**Panel A: New Processes**
- Lists every process present in the "after" snapshot that did not exist in the baseline.
- Shows process name, PID, CPU %, and memory %.
- Highlighted in yellow as a potential concern.

**Panel B: Removed Processes**
- Lists every process present in the baseline that is gone in the "after" snapshot.
- Highlighted in red.

**Panel C: Process Changes**
- Lists processes that exist in both snapshots but show a CPU change >0.5% or memory change >0.5%.
- Displays before/after CPU and memory values with delta.
- Sorted by magnitude of CPU change; top 10 shown.
- Significant spikes (>2% CPU delta) are highlighted in yellow.

**Panel D: New Listening Ports**
- Lists any network ports that entered LISTEN state between the two snapshots.
- Shows process name, PID, protocol, and local address/port.
- Highlights unauthorized or unexpected port openings.

**Header Metadata** (shown on every loaded snapshot):
- Snapshot name and capture timestamp
- SHA-256 checksum (first 16 characters displayed) and signing time — confirms integrity

---

## 6. Development Roadmap

**Phase 1 — Initial System** ✅
- Electron desktop app with `systeminformation` integration
- Local JSON storage in OS app-data directory
- Side-by-side process diff (new, removed, changed)
- Next.js API server deployed to Vercel
- SHA-256 integrity signing on every capture

**Phase 2 — Local App Improvements** 
- Running as a background process, finding changes in processes
- More clear testing procedures implemented into the app
- Better transparency

**Phase 3 — Cloud Sync & Multi-Machine Support**
- Development of the web portion of this app
- Developing a clear flow between all of an organization's machines
- Displaying the company's inforamtion in a readable way

**Phase 4 — Security and Autentication** 
- Clear policies in rules on database tables
- Distinct routing from company to clients
