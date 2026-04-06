'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { TimelineView } from '@/app/components/history/TimelineView';
import { SnapshotDiff } from '@/app/components/history/SnapshotDiff';
import { SystemInfoCard } from '@/app/components/shared/SystemInfoCard';
import { ProcessTable } from '@/app/components/shared/ProcessTable';
import { SnapshotStatus } from '@/app/components/shared/StatusBadge';

type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';

interface SnapshotItem {
  id: string;
  snapshot_name: string;
  timestamp: string;
  status: SnapshotStatus;
  size_bytes: number;
  process_count?: number | null;
  port_count?: number | null;
  memory_used_gb?: number | null;
}

interface MachineDetail {
  machine_id: string;
  machine_name: string;
  machine_type: MachineType;
  snapshot_count: number;
  latest_timestamp: string;
  snapshots: SnapshotItem[];
  latest_system: any;
  latest_processes: any[];
  latest_process_count: number;
  latest_listening_ports: any[];
  latest_port_count: number;
}

interface ComparisonResult {
  baseline_timestamp: string;
  after_timestamp: string;
  time_diff_minutes: number;
  new_processes: any[];
  removed_processes: any[];
  process_changes: any[];
  memory_change_gb: string;
  new_listening_ports: any[];
}

const DEFAULT_API_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

const machineTypeIcons: Record<MachineType, string> = {
  'Laptop': '💻',
  'Desktop': '🖥️',
  'Server': '🗄️',
  'Virtual Machine': '☁️',
  'Unknown': '📦',
};

export default function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const machineId = decodeURIComponent(id);

  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_API_KEY || DEFAULT_API_KEY;

  const loadMachine = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/machines/${encodeURIComponent(machineId)}`, {
        headers: { 'x-api-key': apiKey }
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setMachine(data);
      setError('');
    } catch (e: any) {
      setError(`Failed to load machine: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMachine();
  }, [machineId, apiKey]);

  // Compare snapshots when two are selected
  useEffect(() => {
    if (selectedIds.length !== 2) {
      setComparison(null);
      return;
    }

    const runComparison = async () => {
      setComparing(true);
      try {
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            baseline_id: selectedIds[0],
            after_id: selectedIds[1]
          })
        });

        if (!res.ok) throw new Error(`Comparison failed`);

        const data = await res.json();
        setComparison(data);
      } catch (e) {
        console.error('Comparison error:', e);
        setComparison(null);
      } finally {
        setComparing(false);
      }
    };

    runComparison();
  }, [selectedIds, apiKey]);

  const handleToggleSelect = (snapshotId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(snapshotId)) {
        return prev.filter(id => id !== snapshotId);
      }
      if (prev.length >= 2) {
        // Replace oldest selection
        return [prev[1], snapshotId];
      }
      return [...prev, snapshotId];
    });
  };

  const getSnapshotName = (id: string): string => {
    return machine?.snapshots.find(s => s.id === id)?.snapshot_name || id;
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
              <p className="text-zinc-500">Loading machine details...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !machine) {
    return (
      <div className="app-shell min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="app-card app-card-inner text-center">
            <p className="text-red-300">{error || 'Machine not found'}</p>
            <Link
              href="/dashboard/engineer"
              className="app-btn app-btn-primary mt-4"
            >
              Back to Overview
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      {/* Header */}
      <header className="app-header text-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-0 py-0">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/engineer" className="text-sm text-zinc-400 hover:text-zinc-100">
              ← Back to Overview
            </Link>
            <div className="h-6 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-3">
              <span className="text-3xl">{machineTypeIcons[machine.machine_type]}</span>
              <div>
                <h1 className="text-xl font-bold">{machine.machine_name}</h1>
                <p className="text-sm text-zinc-400">{machine.machine_type} · {machine.snapshot_count} snapshots</p>
              </div>
            </div>
            <button
              onClick={loadMachine}
              disabled={refreshing}
              className="app-btn app-btn-secondary ml-auto"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="app-page">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column: Timeline */}
          <div className="lg:col-span-1">
            <div className="app-card app-card-inner mb-4">
              <h3 className="mb-2 font-semibold text-zinc-100">Snapshot Timeline</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Select 2 snapshots to compare. Click to toggle selection.
              </p>
              {selectedIds.length === 2 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="app-btn app-btn-secondary mb-4 w-full"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <TimelineView
              snapshots={machine.snapshots}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              maxSelections={2}
            />
          </div>

          {/* Right Column: Details / Comparison */}
          <div className="lg:col-span-2 space-y-6">
            {/* Show comparison if two snapshots selected */}
            {selectedIds.length === 2 && (
              <div>
                {comparing ? (
                  <div className="app-card app-card-inner text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
                    <p className="text-zinc-500">Comparing snapshots...</p>
                  </div>
                ) : comparison ? (
                  <SnapshotDiff
                    comparison={comparison}
                    baselineName={getSnapshotName(selectedIds[0])}
                    afterName={getSnapshotName(selectedIds[1])}
                  />
                ) : (
                  <div className="app-card app-card-inner text-center">
                    <p className="text-amber-300">Failed to compare snapshots</p>
                  </div>
                )}
              </div>
            )}

            {/* System Info */}
            {machine.latest_system && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-zinc-200">
                  💻 Latest System Information
                </h3>
                <SystemInfoCard system={machine.latest_system} />
              </div>
            )}

            {/* Network Ports */}
            {machine.latest_listening_ports.length > 0 && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-zinc-200">
                  🌐 Listening Ports ({machine.latest_port_count})
                </h3>
                <div className="app-card max-h-60 overflow-y-auto">
                  {machine.latest_listening_ports.map((port: any, i: number) => (
                    <div key={i} className="flex justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                      <span className="font-medium text-zinc-100">{port.process_name || 'Unknown'}</span>
                      <span className="text-zinc-500">{port.protocol?.toUpperCase()} :{port.local_port}</span>
                    </div>
                  ))}
                  {machine.latest_port_count > machine.latest_listening_ports.length && (
                    <div className="px-4 py-3 text-center text-sm text-zinc-500">
                      ...and {machine.latest_port_count - machine.latest_listening_ports.length} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Processes */}
            {machine.latest_processes.length > 0 && (
              <ProcessTable
                processes={machine.latest_processes}
                maxRows={20}
                showSearch={true}
                title={`⚙️ Running Processes`}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
