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
      <div className="flex flex-wrap gap-2 text-sm">
        {items.slice(0, 4).map(([label, value]) => (
          <span key={label as string} className="text-gray-500">
            <span className="font-medium text-gray-700">{label}:</span> {value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {items.map(([label, value]) => (
        <div key={label as string} className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
          <div className="font-medium text-gray-800 mt-1">{value}</div>
        </div>
      ))}
    </div>
  );
}
