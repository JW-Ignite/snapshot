interface SystemInfo {
  cpu_brand?: string;
  cpu_cores?: number;
  total_memory_gb?: number;
  used_memory_gb?: number;
  os_distro?: string;
  os_release?: string;
  os_platform?: string;
  total_disk_size_gb?: number;
}

interface SystemInfoCardProps {
  system: SystemInfo;
  compact?: boolean;
}

export function SystemInfoCard({ system, compact = false }: SystemInfoCardProps) {
  const items = [
    ['CPU', system.cpu_brand ?? 'Unknown'],
    ['Cores', system.cpu_cores ?? '-'],
    ['Memory', system.total_memory_gb
      ? `${system.total_memory_gb} GB (${system.used_memory_gb ?? 0} GB used)`
      : '-'],
    ['OS', system.os_distro && system.os_release
      ? `${system.os_distro} ${system.os_release}`
      : '-'],
    ['Platform', system.os_platform ?? '-'],
    ['Disk', system.total_disk_size_gb ? `${system.total_disk_size_gb} GB` : '-'],
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-sm text-zinc-300">
        {items.slice(0, 4).map(([label, value]) => (
          <span key={label as string} className="text-zinc-400">
            <span className="font-medium text-zinc-200">{label}:</span> {value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="app-stat-grid cols-3">
      {items.map(([label, value]) => (
        <div key={label as string} className="app-card app-card-inner app-card-muted">
          <div className="app-kicker">{label}</div>
          <div className="mt-1 font-medium text-zinc-100">{value}</div>
        </div>
      ))}
    </div>
  );
}
