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
  const memoryChangeColor = memoryChange > 0 ? 'text-red-600' : memoryChange < 0 ? 'text-emerald-600' : 'text-gray-600';
  const memoryChangeSign = memoryChange > 0 ? '+' : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800">Comparison Results</h3>
          <span className="text-sm text-gray-500">
            {comparison.time_diff_minutes} minutes between snapshots
          </span>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center">A</span>
            <span className="text-gray-600">{baselineName}</span>
          </div>
          <span className="text-gray-400">→</span>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center">B</span>
            <span className="text-gray-600">{afterName}</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-400 uppercase">New Processes</div>
          <div className="text-2xl font-semibold text-amber-600">{comparison.new_processes.length}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-400 uppercase">Removed Processes</div>
          <div className="text-2xl font-semibold text-red-600">{comparison.removed_processes.length}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-400 uppercase">Changed Processes</div>
          <div className="text-2xl font-semibold text-blue-600">{comparison.process_changes.length}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-400 uppercase">Memory Change</div>
          <div className={`text-2xl font-semibold ${memoryChangeColor}`}>
            {memoryChangeSign}{comparison.memory_change_gb} GB
          </div>
        </div>
      </div>

      {/* Detailed Sections */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* New Processes */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
            <h4 className="font-semibold text-amber-800">
              New Processes ({comparison.new_processes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.new_processes.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">No new processes</div>
            ) : (
              comparison.new_processes.slice(0, 20).map((proc, i) => (
                <div key={i} className="px-4 py-2 border-b border-gray-100 text-sm flex justify-between">
                  <span className="font-medium text-gray-700">{proc.name}</span>
                  <span className="text-gray-400">
                    CPU {proc.cpu_usage?.toFixed(1) ?? '0'}% | MEM {proc.mem_usage?.toFixed(1) ?? '0'}%
                  </span>
                </div>
              ))
            )}
            {comparison.new_processes.length > 20 && (
              <div className="px-4 py-2 text-center text-gray-400 text-sm">
                ...and {comparison.new_processes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* Removed Processes */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b border-red-200">
            <h4 className="font-semibold text-red-800">
              Removed Processes ({comparison.removed_processes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.removed_processes.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">No removed processes</div>
            ) : (
              comparison.removed_processes.slice(0, 20).map((proc, i) => (
                <div key={i} className="px-4 py-2 border-b border-gray-100 text-sm">
                  <span className="font-medium text-gray-700">{proc.name}</span>
                </div>
              ))
            )}
            {comparison.removed_processes.length > 20 && (
              <div className="px-4 py-2 text-center text-gray-400 text-sm">
                ...and {comparison.removed_processes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* Process Changes */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
            <h4 className="font-semibold text-blue-800">
              Process Changes ({comparison.process_changes.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.process_changes.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">No significant changes</div>
            ) : (
              comparison.process_changes.slice(0, 20).map((proc, i) => (
                <div key={i} className="px-4 py-2 border-b border-gray-100 text-sm">
                  <div className="font-medium text-gray-700">{proc.name}</div>
                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                    <span className={proc.cpu_change > 0 ? 'text-red-500' : 'text-emerald-500'}>
                      CPU: {proc.cpu_change > 0 ? '+' : ''}{proc.cpu_change.toFixed(2)}%
                    </span>
                    <span className={proc.mem_change > 0 ? 'text-red-500' : 'text-emerald-500'}>
                      MEM: {proc.mem_change > 0 ? '+' : ''}{proc.mem_change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            )}
            {comparison.process_changes.length > 20 && (
              <div className="px-4 py-2 text-center text-gray-400 text-sm">
                ...and {comparison.process_changes.length - 20} more
              </div>
            )}
          </div>
        </div>

        {/* New Listening Ports */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-purple-50 px-4 py-3 border-b border-purple-200">
            <h4 className="font-semibold text-purple-800">
              New Listening Ports ({comparison.new_listening_ports.length})
            </h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {comparison.new_listening_ports.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">No new ports</div>
            ) : (
              comparison.new_listening_ports.slice(0, 20).map((port, i) => (
                <div key={i} className="px-4 py-2 border-b border-gray-100 text-sm flex justify-between">
                  <span className="font-medium text-gray-700">{port.process_name || 'Unknown'}</span>
                  <span className="text-gray-400">
                    {port.protocol?.toUpperCase()} :{port.local_port}
                  </span>
                </div>
              ))
            )}
            {comparison.new_listening_ports.length > 20 && (
              <div className="px-4 py-2 text-center text-gray-400 text-sm">
                ...and {comparison.new_listening_ports.length - 20} more
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
