'use client';

import { StatusBadge, SnapshotStatus } from '../shared/StatusBadge';

interface SnapshotItem {
  id: string;
  snapshot_name: string;
  timestamp: string;
  status: SnapshotStatus;
  size_bytes: number;
  process_count?: number | null;
  port_count?: number | null;
  memory_used_gb?: number | null;
}

interface TimelineViewProps {
  snapshots: SnapshotItem[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  maxSelections?: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function formatTimestamp(timestamp: string): { date: string; time: string } {
  const d = new Date(timestamp);
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export function TimelineView({
  snapshots,
  selectedIds,
  onToggleSelect,
  maxSelections = 2
}: TimelineViewProps) {
  const canSelectMore = selectedIds.length < maxSelections;

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      {/* Timeline items */}
      <div className="space-y-4">
        {snapshots.map((snapshot, index) => {
          const isSelected = selectedIds.includes(snapshot.id);
          const selectionIndex = selectedIds.indexOf(snapshot.id);
          const { date, time } = formatTimestamp(snapshot.timestamp);

          return (
            <div
              key={snapshot.id}
              className={`
                relative pl-10 cursor-pointer
                ${!canSelectMore && !isSelected ? 'opacity-50' : ''}
              `}
              onClick={() => {
                if (isSelected || canSelectMore) {
                  onToggleSelect(snapshot.id);
                }
              }}
            >
              {/* Timeline dot */}
              <div
                className={`
                  absolute left-2.5 w-3 h-3 rounded-full border-2
                  ${isSelected
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'bg-white border-gray-300'
                  }
                `}
              />

              {/* Selection badge */}
              {isSelected && (
                <div className="absolute left-0 -top-1 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {selectionIndex === 0 ? 'A' : 'B'}
                </div>
              )}

              {/* Card */}
              <div
                className={`
                  bg-white rounded-lg p-4 shadow-sm border-2 transition-all
                  ${isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-200'
                    : 'border-transparent hover:border-indigo-200'
                  }
                `}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-800">{snapshot.snapshot_name}</h4>
                    <p className="text-xs text-gray-400">{date} at {time}</p>
                  </div>
                  <StatusBadge status={snapshot.status} />
                </div>

                <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                  {snapshot.process_count != null && <span>{snapshot.process_count} processes</span>}
                  {snapshot.port_count != null && <span>{snapshot.port_count} ports</span>}
                  <span>{formatBytes(snapshot.size_bytes)}</span>
                  {snapshot.memory_used_gb != null && (
                    <span>{snapshot.memory_used_gb} GB RAM</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {snapshots.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No snapshots found for this machine.
        </div>
      )}
    </div>
  );
}
