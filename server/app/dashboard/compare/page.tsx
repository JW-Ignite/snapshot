'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { HealthStatus, HealthIndicator } from '@/app/components/engineer/HealthIndicator';
import { StatusBadge, SnapshotStatus } from '@/app/components/shared/StatusBadge';

type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';

interface MachineData {
  machine_id: string;
  machine_name: string;
  machine_type: MachineType;
  snapshot_count: number;
  latest_timestamp: string;
  health_status: HealthStatus;
  latest_memory_gb?: number | null;
  total_memory_gb?: number | null;
  latest_cpu_cores?: number | null;
  cpu_brand?: string | null;
  os_info?: string | null;
  active_process_count: number;
  listening_port_count: number;
  largest_snapshot_bytes: number;
}

const DEFAULT_API_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

const machineTypeIcons: Record<MachineType, string> = {
  'Laptop': '💻',
  'Desktop': '🖥️',
  'Server': '🗄️',
  'Virtual Machine': '☁️',
  'Unknown': '📦',
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export default function ComparePage() {
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const apiKey = process.env.NEXT_PUBLIC_API_KEY || DEFAULT_API_KEY;

  useEffect(() => {
    let isMounted = true;

    const loadMachines = async () => {
      try {
        const res = await fetch('/api/machines', {
          headers: { 'x-api-key': apiKey }
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        if (isMounted) {
          setMachines(Array.isArray(data) ? data : []);
          setError('');
          setLoading(false);
        }
      } catch (e: any) {
        if (isMounted) {
          setError(`Failed to load machines: ${e.message}`);
          setLoading(false);
        }
      }
    };

    loadMachines();
  }, [apiKey]);

  const selectedMachines = useMemo(() => {
    return selectedIds.map(id => machines.find(m => m.machine_id === id)).filter(Boolean) as MachineData[];
  }, [selectedIds, machines]);

  const handleToggleMachine = (machineId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(machineId)) {
        return prev.filter(id => id !== machineId);
      }
      return [...prev, machineId];
    });
  };

  // Comparison metrics
  const comparisonMetrics = useMemo(() => {
    if (selectedMachines.length < 2) return null;

    const metrics = {
      processes: selectedMachines.map(m => m.active_process_count),
      ports: selectedMachines.map(m => m.listening_port_count),
      memory: selectedMachines.map(m => m.latest_memory_gb ?? 0),
      snapshots: selectedMachines.map(m => m.snapshot_count),
    };

    return {
      processes: {
        values: metrics.processes,
        min: Math.min(...metrics.processes),
        max: Math.max(...metrics.processes),
        avg: metrics.processes.reduce((a, b) => a + b, 0) / metrics.processes.length,
      },
      ports: {
        values: metrics.ports,
        min: Math.min(...metrics.ports),
        max: Math.max(...metrics.ports),
        avg: metrics.ports.reduce((a, b) => a + b, 0) / metrics.ports.length,
      },
      memory: {
        values: metrics.memory,
        min: Math.min(...metrics.memory),
        max: Math.max(...metrics.memory),
        avg: metrics.memory.reduce((a, b) => a + b, 0) / metrics.memory.length,
      },
      snapshots: {
        values: metrics.snapshots,
        min: Math.min(...metrics.snapshots),
        max: Math.max(...metrics.snapshots),
        avg: metrics.snapshots.reduce((a, b) => a + b, 0) / metrics.snapshots.length,
      },
    };
  }, [selectedMachines]);

  if (loading) {
    return (
      <div className="app-shell min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
              <p className="text-zinc-500">Loading machines...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      <Header />

      <main className="app-page">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Machine Selector */}
          <div className="lg:col-span-1">
            <div className="app-card app-card-inner mb-4">
              <h3 className="mb-2 font-semibold text-zinc-100">Select Machines</h3>
              <p className="text-sm text-zinc-500">
                Choose 2 or more machines to compare side-by-side.
              </p>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="app-btn app-btn-secondary mt-3 w-full"
                >
                  Clear Selection ({selectedIds.length})
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {machines.map(machine => {
                const isSelected = selectedIds.includes(machine.machine_id);
                return (
                  <div
                    key={machine.machine_id}
                    onClick={() => handleToggleMachine(machine.machine_id)}
                    className={`
                      app-card app-card-inner cursor-pointer border-2 transition-all
                      ${isSelected
                        ? 'border-white/70 ring-2 ring-white/10'
                        : 'border-transparent hover:border-white/20'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-6 h-6 rounded-full border-2 flex items-center justify-center
                        ${isSelected ? 'bg-white border-white text-black' : 'border-[var(--border-hover)]'}
                      `}>
                        {isSelected && <span className="text-xs font-bold">✓</span>}
                      </div>
                      <span className="text-xl">{machineTypeIcons[machine.machine_type]}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="truncate font-medium text-zinc-100">{machine.machine_name}</h4>
                        <p className="text-xs text-zinc-500">{machine.machine_type}</p>
                      </div>
                      <HealthIndicator status={machine.health_status} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Comparison Table */}
          <div className="lg:col-span-2">
            {selectedMachines.length < 2 ? (
              <div className="app-card app-card-inner text-center">
                <div className="text-6xl mb-4">⚖️</div>
                <h3 className="mb-2 text-xl font-semibold text-zinc-100">Compare Machines</h3>
                <p className="text-zinc-500">
                  Select at least 2 machines from the list to see a side-by-side comparison.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Comparison Header */}
                <div className="app-card app-card-inner">
                  <h3 className="mb-4 font-semibold text-zinc-100">
                    Comparing {selectedMachines.length} Machines
                  </h3>

                  {/* Machine Headers */}
                  <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                    {selectedMachines.map((machine, idx) => (
                      <div key={machine.machine_id} className="text-center">
                        <span className="text-2xl">{machineTypeIcons[machine.machine_type]}</span>
                        <h4 className="mt-1 truncate font-medium text-zinc-100">{machine.machine_name}</h4>
                        <p className="text-xs text-zinc-500">{machine.machine_type}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Metrics Comparison */}
                {comparisonMetrics && (
                  <div className="space-y-4">
                    <MetricRow
                      label="Active Processes"
                      machines={selectedMachines}
                      getValue={(m) => m.active_process_count}
                      format={(v) => v.toString()}
                      metrics={comparisonMetrics.processes}
                    />
                    <MetricRow
                      label="Listening Ports"
                      machines={selectedMachines}
                      getValue={(m) => m.listening_port_count}
                      format={(v) => v.toString()}
                      metrics={comparisonMetrics.ports}
                    />
                    <MetricRow
                      label="Memory Used (GB)"
                      machines={selectedMachines}
                      getValue={(m) => m.latest_memory_gb ?? 0}
                      format={(v) => v.toFixed(1)}
                      metrics={comparisonMetrics.memory}
                    />
                    <MetricRow
                      label="Total Snapshots"
                      machines={selectedMachines}
                      getValue={(m) => m.snapshot_count}
                      format={(v) => v.toString()}
                      metrics={comparisonMetrics.snapshots}
                    />

                    {/* Health Status Row */}
                    <div className="app-card app-card-inner">
                      <div className="mb-3 text-sm font-medium text-zinc-500">Health Status</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center">
                            <HealthIndicator status={machine.health_status} size="lg" showLabel />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* OS Info Row */}
                    <div className="app-card app-card-inner">
                      <div className="mb-3 text-sm font-medium text-zinc-500">Operating System</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center text-sm text-zinc-100">
                            {machine.os_info || 'Unknown'}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CPU Info Row */}
                    <div className="app-card app-card-inner">
                      <div className="mb-3 text-sm font-medium text-zinc-500">CPU</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center">
                            <div className="truncate text-sm text-zinc-100">{machine.cpu_brand || 'Unknown'}</div>
                            <div className="text-xs text-zinc-500">{machine.latest_cpu_cores ?? '-'} cores</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="app-header text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-0 py-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/engineer" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← Back to Overview
          </Link>
          <div className="h-6 w-px bg-[var(--border)]" />
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <span>⚖️</span>
            Compare Machines
          </h1>
        </div>
      </div>
    </header>
  );
}

interface MetricRowProps {
  label: string;
  machines: MachineData[];
  getValue: (m: MachineData) => number;
  format: (v: number) => string;
  metrics: { min: number; max: number; avg: number };
}

function MetricRow({ label, machines, getValue, format, metrics }: MetricRowProps) {
  return (
    <div className="app-card app-card-inner">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-500">
          Min: {format(metrics.min)} | Max: {format(metrics.max)} | Avg: {format(metrics.avg)}
        </span>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${machines.length}, 1fr)` }}>
        {machines.map(machine => {
          const value = getValue(machine);
          const isMax = value === metrics.max && metrics.max !== metrics.min;
          const isMin = value === metrics.min && metrics.max !== metrics.min;

          return (
            <div key={machine.machine_id} className="text-center">
              <span className={`
                text-2xl font-semibold
                ${isMax ? 'text-red-300' : isMin ? 'text-emerald-300' : 'text-zinc-100'}
              `}>
                {format(value)}
              </span>
              {isMax && <span className="ml-1 text-xs text-red-300">↑</span>}
              {isMin && <span className="ml-1 text-xs text-emerald-300">↓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
