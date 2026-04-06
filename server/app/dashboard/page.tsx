'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface SnapshotMeta {
  id: string;
  machine_id: string;
  machine_name: string;
  snapshot_name: string;
  timestamp: string;
  snapshot_size_bytes?: number;
  snapshot_status?: SnapshotStatus;
  snapshot_error?: string | null;
}

type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';
type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';
type SortField = 'updated' | 'name' | 'type' | 'size' | 'status';
type SortDirection = 'asc' | 'desc';

interface MachineGroup {
  machineId: string;
  machineName: string;
  machineType: MachineType;
  snapshots: SnapshotMeta[];
  latestTimestamp: string;
  largestSnapshotSizeBytes: number;
  testNames: string[];
  highestPriorityStatus: SnapshotStatus;
}

const statusOrder: SnapshotStatus[] = ['Pending', 'Running', 'Completed', 'Failed'];

function normalizeSnapshotStatus(status: unknown): SnapshotStatus {
  if (status === 'Pending' || status === 'Running' || status === 'Completed' || status === 'Failed') {
    return status;
  }
  return 'Completed';
}

function statusRank(status: SnapshotStatus): number {
  const rank = statusOrder.indexOf(status);
  return rank === -1 ? statusOrder.indexOf('Completed') : rank;
}

function statusBadgeClasses(status: SnapshotStatus): string {
  if (status === 'Pending') return 'bg-amber-100 text-amber-800';
  if (status === 'Running') return 'bg-blue-100 text-blue-800';
  if (status === 'Failed') return 'bg-red-100 text-red-800';
  return 'bg-emerald-100 text-emerald-800';
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function inferMachineType(machineName: string, machineId: string): MachineType {
  const value = `${machineName} ${machineId}`.toLowerCase();
  if (value.includes('server')) return 'Server';
  if (value.includes('vm') || value.includes('virtual') || value.includes('hyper-v') || value.includes('wsl')) return 'Virtual Machine';
  if (value.includes('macbook') || value.includes('laptop') || value.includes('notebook')) return 'Laptop';
  if (value.includes('desktop') || value.includes('workstation') || value.includes('imac')) return 'Desktop';
  return 'Unknown';
}

function compareMachines(a: MachineGroup, b: MachineGroup, sortField: SortField, sortDirection: SortDirection) {
  if (sortField === 'name') {
    return sortDirection === 'asc'
      ? a.machineName.localeCompare(b.machineName)
      : b.machineName.localeCompare(a.machineName);
  }

  if (sortField === 'updated') {
    return sortDirection === 'asc'
      ? a.latestTimestamp.localeCompare(b.latestTimestamp)
      : b.latestTimestamp.localeCompare(a.latestTimestamp);
  }

  if (sortField === 'type') {
    const byType = a.machineType.localeCompare(b.machineType);
    if (byType !== 0) return byType;
    return sortDirection === 'asc'
      ? a.latestTimestamp.localeCompare(b.latestTimestamp)
      : b.latestTimestamp.localeCompare(a.latestTimestamp);
  }

  if (sortField === 'size') {
    const bySize = sortDirection === 'asc'
      ? a.largestSnapshotSizeBytes - b.largestSnapshotSizeBytes
      : b.largestSnapshotSizeBytes - a.largestSnapshotSizeBytes;
    if (bySize !== 0) return bySize;
    return b.latestTimestamp.localeCompare(a.latestTimestamp);
  }

  if (sortField === 'status') {
    const byStatus = sortDirection === 'asc'
      ? statusRank(a.highestPriorityStatus) - statusRank(b.highestPriorityStatus)
      : statusRank(b.highestPriorityStatus) - statusRank(a.highestPriorityStatus);
    if (byStatus !== 0) return byStatus;
    return b.latestTimestamp.localeCompare(a.latestTimestamp);
  }

  return b.latestTimestamp.localeCompare(a.latestTimestamp);
}

function getDirectionLabel(sortField: SortField, sortDirection: SortDirection): string {
  if (sortField === 'updated') {
    return sortDirection === 'desc' ? 'Newest first' : 'Oldest first';
  }
  if (sortField === 'name') {
    return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
  }
  if (sortField === 'size') {
    return sortDirection === 'desc' ? 'Largest first' : 'Smallest first';
  }
  if (sortField === 'status') {
    return sortDirection === 'desc' ? 'Higher status first' : 'Lower status first';
  }
  return sortDirection === 'desc' ? 'Descending' : 'Ascending';
}

const sortFieldOptions: Array<{ value: SortField; label: string }> = [
  { value: 'updated', label: 'Updated' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'status', label: 'Status' },
];

const DEFAULT_PUBLIC_API_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

export default function Dashboard() {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');

  const apiKey = process.env.NEXT_PUBLIC_API_KEY || DEFAULT_PUBLIC_API_KEY;

  async function loadSnapshots() {
    try {
      setRefreshing(true);
      const response = await fetch('/api/snapshots', { headers: { 'x-api-key': apiKey } });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setSnapshots(Array.isArray(data) ? data : []);
      setError('');
    } catch (e: any) {
      setError(`Failed to load snapshots: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadSnapshots();
  }, [apiKey]);

  async function loadSnapshot(id: string) {
    const res = await fetch(`/api/snapshots/${id}`, { headers: { 'x-api-key': apiKey } });
    const row = await res.json();
    setSelected(row);
  }

  async function deleteSnapshot(id: string) {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return;
    setDeleting(true);
    await fetch(`/api/snapshots/${id}`, { method: 'DELETE', headers: { 'x-api-key': apiKey } });
    setSnapshots(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
    setDeleting(false);
  }

  const machineGroups = useMemo<MachineGroup[]>(() => {
    const grouped = new Map<string, SnapshotMeta[]>();

    for (const snap of snapshots) {
      const current = grouped.get(snap.machine_id) || [];
      current.push(snap);
      grouped.set(snap.machine_id, current);
    }

    const groups: MachineGroup[] = [];
    grouped.forEach((machineSnapshots, machineId) => {
      const sortedSnapshots = [...machineSnapshots].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const machineName = sortedSnapshots[0]?.machine_name || machineId;
      const highestPriorityStatus = sortedSnapshots.reduce<SnapshotStatus>((current, snap) => {
        const next = normalizeSnapshotStatus(snap.snapshot_status);
        return statusRank(next) < statusRank(current) ? next : current;
      }, 'Completed');

      groups.push({
        machineId,
        machineName,
        machineType: inferMachineType(machineName, machineId),
        snapshots: sortedSnapshots,
        latestTimestamp: sortedSnapshots[0]?.timestamp || '',
        largestSnapshotSizeBytes: sortedSnapshots.reduce((max, snap) => {
          return Math.max(max, snap.snapshot_size_bytes || 0);
        }, 0),
        testNames: [...new Set(sortedSnapshots.map(snap => snap.snapshot_name).filter(Boolean))],
        highestPriorityStatus,
      });
    });

    return groups;
  }, [snapshots]);

  const visibleMachines = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = machineGroups
      .map(machine => {
        if (!needle) return machine;

        const machineHaystack = `${machine.machineName} ${machine.machineId} ${machine.machineType} ${machine.highestPriorityStatus}`.toLowerCase();
        const machineMatches = machineHaystack.includes(needle);

        if (machineMatches) {
          return machine;
        }

        const matchingSnapshots = machine.snapshots.filter(snap => {
          const snapshotStatus = normalizeSnapshotStatus(snap.snapshot_status);
          const snapshotHaystack = `${snap.snapshot_name || ''} ${snapshotStatus}`.toLowerCase();
          return snapshotHaystack.includes(needle);
        });

        if (matchingSnapshots.length === 0) {
          return null;
        }

        return {
          ...machine,
          snapshots: matchingSnapshots,
          latestTimestamp: matchingSnapshots[0]?.timestamp || machine.latestTimestamp,
          largestSnapshotSizeBytes: matchingSnapshots.reduce((max, snap) => {
            return Math.max(max, snap.snapshot_size_bytes || 0);
          }, 0),
          testNames: [...new Set(matchingSnapshots.map(snap => snap.snapshot_name).filter(Boolean))],
          highestPriorityStatus: matchingSnapshots.reduce<SnapshotStatus>((current, snap) => {
            const next = normalizeSnapshotStatus(snap.snapshot_status);
            return statusRank(next) < statusRank(current) ? next : current;
          }, 'Completed'),
        };
      })
      .filter((machine): machine is MachineGroup => machine !== null);

    return filtered.sort((a, b) => compareMachines(a, b, sortField, sortDirection));
  }, [machineGroups, query, sortField, sortDirection]);

  const totalMachines = machineGroups.length;
  const machineTypeCounts = useMemo(() => {
    return machineGroups.reduce<Record<MachineType, number>>((acc, machine) => {
      acc[machine.machineType] += 1;
      return acc;
    }, { Laptop: 0, Desktop: 0, Server: 0, 'Virtual Machine': 0, Unknown: 0 });
  }, [machineGroups]);

  return (
    <div className="app-shell flex h-screen">
      {/* Sidebar */}
      <div className="w-80 flex flex-col overflow-y-auto app-sidebar rounded-none border-y-0 border-l-0 border-r">
        <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4 text-white">
          <h1 className="text-xl font-bold">📸 Snapshot Server</h1>
          <p className="text-sm text-zinc-500">Multi-machine dashboard</p>
          <button
            onClick={loadSnapshots}
            disabled={refreshing}
            className="app-btn app-btn-secondary mt-3"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link
            href="/dashboard/engineer"
            className="app-btn app-btn-secondary mt-3 ml-2"
          >
            <span>⚙️</span>
            Engineer Panel
            <span className="text-zinc-500">→</span>
          </Link>
        </div>

        {loading && <p className="p-4 text-zinc-500">Loading...</p>}
        {error && <p className="p-4 text-red-300">{error}</p>}

        <div className="border-b border-[var(--border)] p-3 space-y-2 bg-[var(--surface)]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search machines or tests..."
            className="app-input w-full text-base font-medium"
          />
          <div className="app-card app-card-inner p-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Sort</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {sortFieldOptions.map(option => {
                const active = sortField === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setSortField(option.value)}
                    className={`px-2.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-zinc-300 border-[var(--border)] hover:border-white/30'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))}
              className="app-btn app-btn-secondary w-full"
            >
              Order: {getDirectionLabel(sortField, sortDirection)}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            {totalMachines} machines · {snapshots.length} snapshots
          </p>
          <p className="text-xs text-zinc-600">Manual refresh only to keep Supabase egress and Vercel CPU low.</p>
        </div>

        {visibleMachines.map(machine => {
          return (
            <div key={machine.machineId} className="border-b border-[var(--border)]">
              <div className="bg-[var(--surface)] px-4 py-2">
                <div className="text-sm font-semibold tracking-wide text-zinc-200">
                  🖥️ {machine.machineName}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {machine.machineType} · {machine.snapshots.length} snapshots · Largest {formatBytes(machine.largestSnapshotSizeBytes)} · Status {machine.highestPriorityStatus} · Last update {new Date(machine.latestTimestamp).toLocaleString()}
                </div>
              </div>
              {machine.snapshots.map(snap => (
                <div
                  key={snap.id}
                  onClick={() => loadSnapshot(snap.id)}
                  className={`group cursor-pointer border-b border-[var(--border)] px-4 py-3 text-sm transition-colors hover:bg-white/5 ${
                    selected?.id === snap.id ? 'border-l-4 border-white bg-white/5' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-medium text-zinc-100">{snap.snapshot_name}</div>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses(normalizeSnapshotStatus(snap.snapshot_status))}`}>
                      {normalizeSnapshotStatus(snap.snapshot_status)}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSnapshot(snap.id); }}
                      disabled={deleting}
                      className="ml-2 shrink-0 text-xs text-red-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-200"
                      title="Delete snapshot"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {new Date(snap.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {!loading && !error && visibleMachines.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">No machines match your filters.</p>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="p-8">
            <h2 className="mb-4 text-2xl font-bold text-zinc-100">Organization Overview</h2>
            <p className="mb-6 text-zinc-500">Sort machines by recency, name, or type from the sidebar. Select any snapshot to inspect full details.</p>

            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(machineTypeCounts).map(([type, count]) => (
                <div key={type} className="app-card app-card-inner">
                  <div className="app-kicker">{type}</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-100">{count}</div>
                </div>
              ))}
            </div>

            <div className="app-card app-card-inner">
              <h3 className="mb-2 text-lg font-semibold text-zinc-100">Feature Board</h3>
              <ul className="list-inside list-disc space-y-2 text-sm text-zinc-400">
                <li>Now: sorting by recency, machine name, and inferred machine type.</li>
                <li>Next: add tags (team, environment, risk level) for richer filtering.</li>
                <li>Next: add status badges for stale machines (for example no snapshot in 7+ days).</li>
                <li>Next: save per-user dashboard views (favorite filters and sort mode).</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="mb-6 flex items-start justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-2xl font-bold text-zinc-100">{selected.snapshot_name}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {new Date(selected.timestamp).toLocaleString()} · 🖥️ {selected.machine_name}
                </p>
                {selected.data?.integrity && (
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    ✓ SHA256: {selected.data.integrity.sha256_checksum.substring(0, 16)}...
                  </p>
                )}
              </div>
            </div>

            {/* System Info */}
            <section className="mb-8">
              <h3 className="mb-3 text-lg font-semibold text-zinc-200">💻 System Information</h3>
              <div className="app-stat-grid cols-3">
                {[
                  ['CPU', `${selected.data?.system?.cpu_brand}`],
                  ['Cores', selected.data?.system?.cpu_cores],
                  ['Memory', `${selected.data?.system?.total_memory_gb} GB (${selected.data?.system?.used_memory_gb} GB used)`],
                  ['OS', `${selected.data?.system?.os_distro} ${selected.data?.system?.os_release}`],
                  ['Platform', selected.data?.system?.os_platform],
                  ['Disk', `${selected.data?.system?.total_disk_size_gb} GB`],
                ].map(([label, value]) => (
                  <div key={label as string} className="app-card app-card-inner app-card-muted">
                    <div className="app-kicker">{label}</div>
                    <div className="mt-1 font-medium text-zinc-100">{value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Network */}
            <section className="mb-8">
              <h3 className="mb-3 text-lg font-semibold text-zinc-200">🌐 Listening Ports</h3>
              <div className="app-card overflow-hidden">
                {selected.data?.network?.listening_ports?.slice(0, 10).map((port: any, i: number) => (
                  <div key={i} className="flex justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                    <span className="font-medium text-zinc-100">{port.process_name || 'Unknown'}</span>
                    <span className="text-zinc-500">{port.protocol?.toUpperCase()} :{port.local_port}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Processes */}
            <section>
              <h3 className="mb-3 text-lg font-semibold text-zinc-200">
                ⚙️ Top Processes ({selected.process_count ?? selected.data?.running_processes?.length ?? 0} total)
              </h3>
              <div className="app-card overflow-hidden">
                {selected.data?.running_processes?.slice(0, 20).map((proc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                    <div>
                      <span className="font-medium text-zinc-100">{proc.name}</span>
                      <span className="ml-2 text-zinc-500">PID {proc.pid}</span>
                    </div>
                    <div className="text-right text-zinc-500">
                      <span className="mr-4">CPU {proc.cpu_usage?.toFixed(2)}%</span>
                      <span>MEM {proc.mem_usage?.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
