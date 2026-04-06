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
        <h3 className="mb-3 text-lg font-semibold text-zinc-100">
          {title} ({processes.length} total)
        </h3>
      )}

      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter processes..."
          className="app-input mb-3 text-sm"
        />
      )}

      <div className="app-card">
        {displayed.map((proc, i) => (
          <div key={`${proc.pid}-${i}`} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">
            <div>
              <span className="font-medium text-zinc-100">{proc.name}</span>
              <span className="ml-2 text-zinc-500">PID {proc.pid}</span>
            </div>
            <div className="text-right text-zinc-400">
              <span className="mr-4">CPU {proc.cpu_usage?.toFixed(2) ?? '0.00'}%</span>
              <span>MEM {proc.mem_usage?.toFixed(2) ?? '0.00'}%</span>
            </div>
          </div>
        ))}

        {remaining > 0 && (
          <div className="px-4 py-3 text-center text-sm text-zinc-500">
            ...and {remaining} more
          </div>
        )}

        {displayed.length === 0 && (
          <div className="px-4 py-4 text-center text-sm text-zinc-500">
            No processes found
          </div>
        )}
      </div>
    </div>
  );
}
