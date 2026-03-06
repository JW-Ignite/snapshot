'use client';

import { useState, useMemo } from 'react';

interface Process {
  name: string;
  pid: number;
  cpu_usage?: number;
  mem_usage?: number;
  command?: string;
  user?: string;
}

interface ProcessTableProps {
  processes: Process[];
  maxRows?: number;
  showSearch?: boolean;
  title?: string;
}

export function ProcessTable({ processes, maxRows = 20, showSearch = false, title }: ProcessTableProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return processes;
    const needle = search.toLowerCase();
    return processes.filter(p =>
      p.name.toLowerCase().includes(needle) ||
      p.command?.toLowerCase().includes(needle) ||
      p.user?.toLowerCase().includes(needle)
    );
  }, [processes, search]);

  const displayed = filtered.slice(0, maxRows);
  const remaining = filtered.length - displayed.length;

  return (
    <div>
      {title && (
        <h3 className="text-lg font-semibold text-gray-700 mb-3">
          {title} ({processes.length} total)
        </h3>
      )}

      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter processes..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3 text-sm"
        />
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {displayed.map((proc, i) => (
          <div key={`${proc.pid}-${i}`} className="px-4 py-2 border-b text-sm flex justify-between items-center">
            <div>
              <span className="font-medium">{proc.name}</span>
              <span className="text-gray-400 ml-2">PID {proc.pid}</span>
            </div>
            <div className="text-right text-gray-500">
              <span className="mr-4">CPU {proc.cpu_usage?.toFixed(2) ?? '0.00'}%</span>
              <span>MEM {proc.mem_usage?.toFixed(2) ?? '0.00'}%</span>
            </div>
          </div>
        ))}

        {remaining > 0 && (
          <div className="px-4 py-2 text-sm text-gray-400 text-center">
            ...and {remaining} more
          </div>
        )}

        {displayed.length === 0 && (
          <div className="px-4 py-4 text-sm text-gray-400 text-center">
            No processes found
          </div>
        )}
      </div>
    </div>
  );
}
