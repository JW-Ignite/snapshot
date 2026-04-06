'use client';

interface Process {
  name: string;
  pid?: number;
  cpu_usage?: number;
  mem_usage?: number;
}

interface ProcessChange {
  name: string;
  cpu_change: number;
  mem_change: number;
  cpu_before: number;
  cpu_after: number;
  mem_before: number;
  mem_after: number;
}

interface Port {
  process_name?: string;
  pid?: number;
  protocol?: string;
  local_port: number;
  local_address?: string;
}

interface ApplicationChange {
  name: string;
  source?: string;
}

interface StartupChange {
  name: string;
  scope: string;
}

interface FilesystemChange {
  path: string;
  name: string;
  scope: string;
  type: string;
  hash_changed?: boolean;
  size_changed?: boolean;
  mtime_changed?: boolean;
}

interface Concern {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail?: string;
}

interface ComparisonResult {
  baseline_timestamp: string;
  after_timestamp: string;
  time_diff_minutes: number;
  new_processes: Process[];
  removed_processes: Process[];
  new_applications?: ApplicationChange[];
  removed_applications?: ApplicationChange[];
  new_startup_items?: StartupChange[];
  removed_startup_items?: StartupChange[];
  new_filesystem_items?: FilesystemChange[];
  removed_filesystem_items?: FilesystemChange[];
  modified_filesystem_items?: FilesystemChange[];
  recent_added_files?: FilesystemChange[];
  process_changes: ProcessChange[];
  memory_change_gb: string;
  new_listening_ports: Port[];
  concerns?: Concern[];
  concern_summary?: {
    level: 'high' | 'medium' | 'low';
    text: string;
  };
}

interface SnapshotDiffProps {
  comparison: ComparisonResult;
  baselineName: string;
  afterName: string;
}

export function SnapshotDiff({ comparison, baselineName, afterName }: SnapshotDiffProps) {
  const memoryChange = parseFloat(comparison.memory_change_gb);
  const memoryChangeColor = memoryChange > 0 ? 'text-red-300' : memoryChange < 0 ? 'text-emerald-300' : 'text-zinc-400';
  const memoryChangeSign = memoryChange > 0 ? '+' : '';
  const concernLevel = comparison.concern_summary?.level || 'low';
  const concernColor = concernLevel === 'high'
    ? 'text-red-300'
    : concernLevel === 'medium'
      ? 'text-amber-300'
      : 'text-emerald-300';
  const newApplications = comparison.new_applications || [];
  const newStartupItems = comparison.new_startup_items || [];
  const recentAddedFiles = comparison.recent_added_files || [];
  const modifiedFilesystemItems = comparison.modified_filesystem_items || [];
  const concerns = comparison.concerns || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="app-card app-card-inner">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-zinc-100">Comparison Results</h3>
          <span className="text-sm text-zinc-500">
            {comparison.time_diff_minutes} minutes between snapshots
          </span>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-black">A</span>
            <span className="text-zinc-300">{baselineName}</span>
          </div>
          <span className="text-zinc-500">→</span>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-black">B</span>
            <span className="text-zinc-300">{afterName}</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="app-stat-grid cols-4">
        <div className="app-card app-card-inner">
          <div className="app-kicker">Risk</div>
          <div className={`text-2xl font-semibold ${concernColor}`}>{concernLevel.toUpperCase()}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">New Processes</div>
          <div className="text-2xl font-semibold text-amber-300">{comparison.new_processes.length}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">Removed Processes</div>
          <div className="text-2xl font-semibold text-red-300">{comparison.removed_processes.length}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">Changed Processes</div>
          <div className="text-2xl font-semibold text-sky-300">{comparison.process_changes.length}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">Memory Change</div>
          <div className={`text-2xl font-semibold ${memoryChangeColor}`}>
            {memoryChangeSign}{comparison.memory_change_gb} GB
          </div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">New Apps</div>
          <div className="text-2xl font-semibold text-rose-300">{newApplications.length}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">Startup Items</div>
          <div className="text-2xl font-semibold text-orange-300">{newStartupItems.length}</div>
        </div>
        <div className="app-card app-card-inner">
          <div className="app-kicker">Recent Added Files</div>
          <div className="text-2xl font-semibold text-fuchsia-300">{recentAddedFiles.length}</div>
        </div>
      </div>

      {comparison.concern_summary && (
        <div className="app-card app-card-inner">
          <div className="app-kicker mb-2">Concern Summary</div>
          <div className={`font-medium ${concernColor}`}>{comparison.concern_summary.text}</div>
        </div>
      )}

      {/* Detailed Sections */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recently Added Files */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-fuchsia-300">
              Recently Added Files ({recentAddedFiles.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {recentAddedFiles.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No recent file additions</div>
            ) : (
              recentAddedFiles.slice(0, 20).map((item, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="font-medium text-zinc-100">{item.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.scope} · {item.path}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* New Applications */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-rose-300">
              New Applications ({newApplications.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {newApplications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No new applications</div>
            ) : (
              newApplications.slice(0, 20).map((app, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="font-medium text-zinc-100">{app.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{app.source || 'unknown source'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Startup Items */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-orange-300">
              New Startup Items ({newStartupItems.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {newStartupItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No new startup items</div>
            ) : (
              newStartupItems.slice(0, 20).map((item, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="font-medium text-zinc-100">{item.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.scope}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* File Modifications */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-violet-300">
              Modified Files ({modifiedFilesystemItems.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {modifiedFilesystemItems.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No modified files</div>
            ) : (
              modifiedFilesystemItems.slice(0, 20).map((item, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="font-medium text-zinc-100">{item.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.scope} · {item.path}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Concerns */}
        <div className="app-card overflow-hidden md:col-span-2">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-zinc-100">
              Concerns ({concerns.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {concerns.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No major concerns detected</div>
            ) : (
              concerns.slice(0, 30).map((concern, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className={`font-medium ${concern.severity === 'high' ? 'text-red-300' : concern.severity === 'medium' ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {concern.title}
                  </div>
                  {concern.detail && <div className="mt-1 text-xs text-zinc-500">{concern.detail}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* New Processes */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-amber-300">
              New Processes ({comparison.new_processes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.new_processes.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No new processes</div>
            ) : (
              comparison.new_processes.slice(0, 20).map((proc, i) => (
                <div key={i} className="flex justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <span className="font-medium text-zinc-100">{proc.name}</span>
                  <span className="text-zinc-500">
                    CPU {proc.cpu_usage?.toFixed(1) ?? '0'}% | MEM {proc.mem_usage?.toFixed(1) ?? '0'}%
                  </span>
                </div>
              ))
            )}
            {comparison.new_processes.length > 20 && (
              <div className="px-4 py-3 text-center text-sm text-zinc-500">
                ...and {comparison.new_processes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* Removed Processes */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-red-300">
              Removed Processes ({comparison.removed_processes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.removed_processes.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No removed processes</div>
            ) : (
              comparison.removed_processes.slice(0, 20).map((proc, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <span className="font-medium text-zinc-100">{proc.name}</span>
                </div>
              ))
            )}
            {comparison.removed_processes.length > 20 && (
              <div className="px-4 py-3 text-center text-sm text-zinc-500">
                ...and {comparison.removed_processes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* Process Changes */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-sky-300">
              Process Changes ({comparison.process_changes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.process_changes.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No significant changes</div>
            ) : (
              comparison.process_changes.slice(0, 20).map((proc, i) => (
                <div key={i} className="border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="font-medium text-zinc-100">{proc.name}</div>
                  <div className="mt-1 flex gap-4 text-xs text-zinc-500">
                    <span className={proc.cpu_change > 0 ? 'text-red-300' : 'text-emerald-300'}>
                      CPU: {proc.cpu_change > 0 ? '+' : ''}{proc.cpu_change.toFixed(2)}%
                    </span>
                    <span className={proc.mem_change > 0 ? 'text-red-300' : 'text-emerald-300'}>
                      MEM: {proc.mem_change > 0 ? '+' : ''}{proc.mem_change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            )}
            {comparison.process_changes.length > 20 && (
              <div className="px-4 py-3 text-center text-sm text-zinc-500">
                ...and {comparison.process_changes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* New Listening Ports */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-[var(--border)] bg-white/5 px-4 py-3">
            <h4 className="font-semibold text-zinc-200">
              New Listening Ports ({comparison.new_listening_ports.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.new_listening_ports.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No new ports</div>
            ) : (
              comparison.new_listening_ports.slice(0, 20).map((port, i) => (
                <div key={i} className="flex justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
                  <span className="font-medium text-zinc-100">{port.process_name || 'Unknown'}</span>
                  <span className="text-zinc-500">
                    {port.protocol?.toUpperCase()} :{port.local_port}
                  </span>
                </div>
              ))
            )}
            {comparison.new_listening_ports.length > 20 && (
              <div className="px-4 py-3 text-center text-sm text-zinc-500">
                ...and {comparison.new_listening_ports.length - 20} more
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
