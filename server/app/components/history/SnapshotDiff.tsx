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

interface ComparisonResult {
  baseline_timestamp: string;
  after_timestamp: string;
  time_diff_minutes: number;
  new_processes: Process[];
  removed_processes: Process[];
  process_changes: ProcessChange[];
  memory_change_gb: string;
  new_listening_ports: Port[];
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
      </div>

      {/* Detailed Sections */}
      <div className="grid md:grid-cols-2 gap-6">
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
