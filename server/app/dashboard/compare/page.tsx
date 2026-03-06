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
      <div className="min-h-screen bg-gray-100">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading machines...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Machine Selector */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">Select Machines</h3>
              <p className="text-sm text-gray-500">
                Choose 2 or more machines to compare side-by-side.
              </p>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="mt-3 w-full px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
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
                      bg-white rounded-lg p-3 shadow-sm cursor-pointer
                      border-2 transition-all
                      ${isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-200'
                        : 'border-transparent hover:border-indigo-200'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-6 h-6 rounded-full border-2 flex items-center justify-center
                        ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}
                      `}>
                        {isSelected && <span className="text-xs font-bold">✓</span>}
                      </div>
                      <span className="text-xl">{machineTypeIcons[machine.machine_type]}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-800 truncate">{machine.machine_name}</h4>
                        <p className="text-xs text-gray-400">{machine.machine_type}</p>
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
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="text-6xl mb-4">⚖️</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Compare Machines</h3>
                <p className="text-gray-500">
                  Select at least 2 machines from the list to see a side-by-side comparison.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Comparison Header */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <h3 className="font-semibold text-gray-800 mb-4">
                    Comparing {selectedMachines.length} Machines
                  </h3>

                  {/* Machine Headers */}
                  <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                    {selectedMachines.map((machine, idx) => (
                      <div key={machine.machine_id} className="text-center">
                        <span className="text-2xl">{machineTypeIcons[machine.machine_type]}</span>
                        <h4 className="font-medium text-gray-800 truncate mt-1">{machine.machine_name}</h4>
                        <p className="text-xs text-gray-400">{machine.machine_type}</p>
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
                    <div className="bg-white rounded-lg shadow-sm p-4">
                      <div className="text-sm font-medium text-gray-500 mb-3">Health Status</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center">
                            <HealthIndicator status={machine.health_status} size="lg" showLabel />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* OS Info Row */}
                    <div className="bg-white rounded-lg shadow-sm p-4">
                      <div className="text-sm font-medium text-gray-500 mb-3">Operating System</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center text-sm text-gray-700">
                            {machine.os_info || 'Unknown'}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CPU Info Row */}
                    <div className="bg-white rounded-lg shadow-sm p-4">
                      <div className="text-sm font-medium text-gray-500 mb-3">CPU</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedMachines.length}, 1fr)` }}>
                        {selectedMachines.map(machine => (
                          <div key={machine.machine_id} className="text-center">
                            <div className="text-sm text-gray-700 truncate">{machine.cpu_brand || 'Unknown'}</div>
                            <div className="text-xs text-gray-400">{machine.latest_cpu_cores ?? '-'} cores</div>
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
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/engineer" className="text-white/80 hover:text-white text-sm">
            ← Back to Overview
          </Link>
          <div className="h-6 w-px bg-white/30" />
          <h1 className="text-xl font-bold flex items-center gap-2">
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
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-xs text-gray-400">
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
                ${isMax ? 'text-red-600' : isMin ? 'text-emerald-600' : 'text-gray-800'}
              `}>
                {format(value)}
              </span>
              {isMax && <span className="ml-1 text-xs text-red-500">↑</span>}
              {isMin && <span className="ml-1 text-xs text-emerald-500">↓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
