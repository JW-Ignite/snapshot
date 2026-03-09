export type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

export function normalizeSnapshotStatus(status: unknown): SnapshotStatus {
  if (status === 'Pending' || status === 'Running' || status === 'Completed' || status === 'Failed') {
    return status;
  }
  return 'Completed';
}

export function statusBadgeClasses(status: SnapshotStatus): string {
  if (status === 'Pending') return 'bg-amber-100 text-amber-800';
  if (status === 'Running') return 'bg-blue-100 text-blue-800';
  if (status === 'Failed') return 'bg-red-100 text-red-800';
  return 'bg-emerald-100 text-emerald-800';
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
