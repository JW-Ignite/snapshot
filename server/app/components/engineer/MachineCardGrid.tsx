'use client';

import { useState, useMemo } from 'react';
import { MachineCard } from './MachineCard';
import { HealthStatus } from './HealthIndicator';

type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';
type SortField = 'updated' | 'name' | 'type' | 'health' | 'snapshots';
type SortDirection = 'asc' | 'desc';

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

interface MachineCardGridProps {
  machines: MachineData[];
  onSelectMachine: (machineId: string) => void;
  selectedMachineId?: string;
}

const healthOrder: HealthStatus[] = ['critical', 'warning', 'stale', 'healthy'];

const sortOptions: Array<{ value: SortField; label: string }> = [
  { value: 'updated', label: 'Last Updated' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'health', label: 'Health' },
  { value: 'snapshots', label: 'Snapshots' },
];

function getDirectionLabel(sortField: SortField, sortDirection: SortDirection): string {
  if (sortField === 'updated') return sortDirection === 'desc' ? 'Newest first' : 'Oldest first';
  if (sortField === 'name') return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
  if (sortField === 'health') return sortDirection === 'asc' ? 'Critical first' : 'Healthy first';
  if (sortField === 'snapshots') return sortDirection === 'desc' ? 'Most first' : 'Least first';
  return sortDirection === 'desc' ? 'Desc' : 'Asc';
}

export function MachineCardGrid({ machines, onSelectMachine, selectedMachineId }: MachineCardGridProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAndSorted = useMemo(() => {
    const needle = search.toLowerCase().trim();

    // Filter
    let filtered = machines;
    if (needle) {
      filtered = machines.filter(m =>
        m.machine_name.toLowerCase().includes(needle) ||
        m.machine_id.toLowerCase().includes(needle) ||
        m.machine_type.toLowerCase().includes(needle) ||
        m.health_status.includes(needle)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      let cmp = 0;

      switch (sortField) {
        case 'name':
          cmp = a.machine_name.localeCompare(b.machine_name);
          break;
        case 'type':
          cmp = a.machine_type.localeCompare(b.machine_type);
          break;
        case 'health':
          cmp = healthOrder.indexOf(a.health_status) - healthOrder.indexOf(b.health_status);
          break;
        case 'snapshots':
          cmp = a.snapshot_count - b.snapshot_count;
          break;
        case 'updated':
        default:
          cmp = a.latest_timestamp.localeCompare(b.latest_timestamp);
          break;
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [machines, search, sortField, sortDirection]);

  // Count by health status
  const healthCounts = useMemo(() => {
    return machines.reduce((acc, m) => {
      acc[m.health_status] = (acc[m.health_status] || 0) + 1;
      return acc;
    }, {} as Record<HealthStatus, number>);
  }, [machines]);

  return (
    <div>
      {/* Health Summary Bar */}
      <div className="flex gap-4 mb-4">
        {(['healthy', 'warning', 'critical', 'stale'] as HealthStatus[]).map(status => (
          <div
            key={status}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              status === 'healthy' ? 'bg-emerald-100 text-emerald-700' :
              status === 'warning' ? 'bg-amber-100 text-amber-700' :
              status === 'critical' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'
            }`}
          >
            <span className="capitalize">{status}</span>
            <span className="font-bold">{healthCounts[status] || 0}</span>
          </div>
        ))}
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search machines..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
        />

        <div className="flex gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50"
          >
            {getDirectionLabel(sortField, sortDirection)}
          </button>
        </div>
      </div>

      {/* Machine Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAndSorted.map(machine => (
          <MachineCard
            key={machine.machine_id}
            machine={machine}
            onClick={() => onSelectMachine(machine.machine_id)}
            isSelected={selectedMachineId === machine.machine_id}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredAndSorted.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {search ? 'No machines match your search.' : 'No machines found.'}
        </div>
      )}
    </div>
  );
}
