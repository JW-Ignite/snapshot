export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'stale';

interface HealthIndicatorProps {
  status: HealthStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusConfig: Record<HealthStatus, { color: string; bgColor: string; label: string }> = {
  healthy: { color: 'bg-emerald-500', bgColor: 'bg-emerald-100', label: 'Healthy' },
  warning: { color: 'bg-amber-500', bgColor: 'bg-amber-100', label: 'Warning' },
  critical: { color: 'bg-red-500', bgColor: 'bg-red-100', label: 'Critical' },
  stale: { color: 'bg-gray-400', bgColor: 'bg-gray-100', label: 'Stale' },
};

const sizeConfig = {
  sm: { dot: 'w-2 h-2', pulse: 'w-4 h-4', text: 'text-xs' },
  md: { dot: 'w-3 h-3', pulse: 'w-5 h-5', text: 'text-sm' },
  lg: { dot: 'w-4 h-4', pulse: 'w-6 h-6', text: 'text-base' },
};

export function HealthIndicator({ status, size = 'md', showLabel = false }: HealthIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center">
        {/* Pulse animation for non-stale status */}
        {status !== 'stale' && (
          <span
            className={`absolute ${sizes.pulse} ${config.bgColor} rounded-full animate-ping opacity-75`}
          />
        )}
        {/* Solid dot */}
        <span className={`relative ${sizes.dot} ${config.color} rounded-full`} />
      </div>

      {showLabel && (
        <span className={`${sizes.text} font-medium text-gray-600`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// Helper function to compute health status from snapshot data
export function computeHealthStatus(
  latestTimestamp: string,
  highestPriorityStatus: string,
  hasPendingOrRunning: boolean
): HealthStatus {
  const now = new Date();
  const lastUpdate = new Date(latestTimestamp);
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

  // Critical: has failed snapshots
  if (highestPriorityStatus === 'Failed') {
    return 'critical';
  }

  // Stale: no snapshot in 7+ days
  if (daysSinceUpdate >= 7) {
    return 'stale';
  }

  // Warning: pending/running snapshots OR 3+ days since last update
  if (hasPendingOrRunning || daysSinceUpdate >= 3) {
    return 'warning';
  }

  // Healthy: recent completed snapshots
  return 'healthy';
}
