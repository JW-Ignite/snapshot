export type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

export function normalizeSnapshotStatus(status: unknown): SnapshotStatus {
  if (status === 'Pending' || status === 'Running' || status === 'Completed' || status === 'Failed') {
    return status;
  }
  return 'Completed';
}

export function statusBadgeClasses(status: SnapshotStatus): string {
  if (status === 'Pending') return 'bg-amber-500/10 text-amber-300 border border-amber-500/30';
  if (status === 'Running') return 'bg-sky-500/10 text-sky-300 border border-sky-500/30';
  if (status === 'Failed') return 'bg-red-500/10 text-red-300 border border-red-500/30';
  return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
}

interface StatusBadgeProps {
  status: SnapshotStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'text-[11px] px-2 py-0.5'
    : 'text-xs px-2.5 py-1';

  return (
    <span className={`font-semibold rounded-full ${sizeClasses} ${statusBadgeClasses(status)}`}>
      {status}
    </span>
  );
}
