'use client';

import { HealthIndicator, HealthStatus } from './HealthIndicator';

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

interface MachineCardProps {
  machine: MachineData;
  onClick: () => void;
  isSelected?: boolean;
}

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

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function MachineCard({ machine, onClick, isSelected = false }: MachineCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        app-card app-card-inner cursor-pointer
        border-2 transition-all duration-200
        hover:border-white/20 hover:scale-[1.02]
        ${isSelected ? 'border-white/70 ring-2 ring-white/10' : 'border-transparent'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{machineTypeIcons[machine.machine_type]}</span>
          <div>
            <h3 className="max-w-[180px] truncate font-semibold text-zinc-100">
              {machine.machine_name}
            </h3>
            <p className="text-xs text-zinc-500">{machine.machine_type}</p>
          </div>
        </div>
        <HealthIndicator status={machine.health_status} size="md" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded border border-[var(--border)] bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase text-zinc-500">Snapshots</div>
          <div className="text-sm font-semibold text-zinc-100">{machine.snapshot_count}</div>
        </div>
        <div className="rounded border border-[var(--border)] bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase text-zinc-500">Processes</div>
          <div className="text-sm font-semibold text-zinc-100">{machine.active_process_count}</div>
        </div>
        <div className="rounded border border-[var(--border)] bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase text-zinc-500">Ports</div>
          <div className="text-sm font-semibold text-zinc-100">{machine.listening_port_count}</div>
        </div>
        <div className="rounded border border-[var(--border)] bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase text-zinc-500">Memory</div>
          <div className="text-sm font-semibold text-zinc-100">
            {machine.latest_memory_gb != null ? `${machine.latest_memory_gb} GB` : '-'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs text-zinc-500">
        <span>{formatTimestamp(machine.latest_timestamp)}</span>
        <span>{formatBytes(machine.largest_snapshot_bytes)}</span>
      </div>
    </div>
  );
}
