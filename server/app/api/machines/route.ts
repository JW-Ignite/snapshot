import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';
type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';
type HealthStatus = 'healthy' | 'warning' | 'critical' | 'stale';
const LIST_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

export const maxDuration = 5;

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  return key === process.env.API_SECRET_KEY;
}

function normalizeStatus(value: unknown): SnapshotStatus {
  if (typeof value !== 'string') return 'Completed';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'running') return 'Running';
  if (normalized === 'failed') return 'Failed';
  return 'Completed';
}

function extractStatus(data: any): SnapshotStatus {
  const candidate = data?.metadata?.snapshot_status || data?.metadata?.status;
  return normalizeStatus(candidate);
}

function isMissingDerivedSnapshotColumnsError(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  const value = message.toLowerCase();
  const mentionsDerivedColumn =
    value.includes('snapshot_status') ||
    value.includes('snapshot_size_bytes') ||
    value.includes('snapshot_error');

  return (
    mentionsDerivedColumn &&
    ((value.includes('column') && value.includes('does not exist')) || value.includes('schema cache'))
  );
}

function inferMachineType(machineName: string, machineId: string): MachineType {
  const value = `${machineName} ${machineId}`.toLowerCase();
  if (value.includes('server')) return 'Server';
  if (value.includes('vm') || value.includes('virtual') || value.includes('hyper-v') || value.includes('wsl')) return 'Virtual Machine';
  if (value.includes('macbook') || value.includes('laptop') || value.includes('notebook')) return 'Laptop';
  if (value.includes('desktop') || value.includes('workstation') || value.includes('imac')) return 'Desktop';
  return 'Unknown';
}

function computeHealthStatus(
  latestTimestamp: string,
  statuses: SnapshotStatus[]
): HealthStatus {
  const now = new Date();
  const lastUpdate = new Date(latestTimestamp);
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

  const hasFailed = statuses.includes('Failed');
  const hasPendingOrRunning = statuses.includes('Pending') || statuses.includes('Running');

  if (hasFailed) return 'critical';
  if (daysSinceUpdate >= 7) return 'stale';
  if (hasPendingOrRunning || daysSinceUpdate >= 3) return 'warning';
  return 'healthy';
}

function estimateSnapshotSizeBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
  } catch {
    return 0;
  }
}

// GET /api/machines — list all machines with aggregated health metrics
// Only fetches last N snapshots per machine to avoid massive queries
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Limit to last 10 snapshots globally to prevent egress explosion
  const maxSnapshots = 10;

  // Try lightweight query first; fall back to fetching data column if new columns don't exist
  let rows: any[] = [];
  let usedFallback = false;

  const { data, error } = await getSupabase()
    .from('snapshots')
    .select('id, machine_id, machine_name, snapshot_name, timestamp, snapshot_status, snapshot_size_bytes, snapshot_error')
    .order('timestamp', { ascending: false })
    .limit(maxSnapshots);

  if (error) {
    if (!isMissingDerivedSnapshotColumnsError(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const fallback = await getSupabase()
      .from('snapshots')
      .select('id, machine_id, machine_name, snapshot_name, timestamp')
      .order('timestamp', { ascending: false })
      .limit(maxSnapshots);

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    rows = fallback.data || [];
    usedFallback = true;
  } else {
    rows = data || [];
  }

  // Group snapshots by machine_id
  const machineMap = new Map<string, {
    machine_id: string;
    machine_name: string;
    snapshots: any[];
    statuses: SnapshotStatus[];
  }>();

  for (const row of rows) {
    const existing = machineMap.get(row.machine_id);
    const status = usedFallback ? 'Completed' : normalizeStatus(row.snapshot_status);

    if (existing) {
      existing.snapshots.push(row);
      existing.statuses.push(status);
    } else {
      machineMap.set(row.machine_id, {
        machine_id: row.machine_id,
        machine_name: row.machine_name,
        snapshots: [row],
        statuses: [status],
      });
    }
  }

  // Build response with aggregated data
  const machines = Array.from(machineMap.values()).map(machine => {
    const latestSnapshot = machine.snapshots[0];

    return {
      machine_id: machine.machine_id,
      machine_name: machine.machine_name,
      machine_type: inferMachineType(machine.machine_name, machine.machine_id),
      snapshot_count: machine.snapshots.length,
      latest_snapshot_id: latestSnapshot?.id,
      latest_timestamp: latestSnapshot?.timestamp,
      health_status: computeHealthStatus(latestSnapshot?.timestamp || '', machine.statuses),
      latest_memory_gb: null,
      total_memory_gb: null,
      latest_cpu_cores: null,
      cpu_brand: null,
      os_info: null,
      active_process_count: 0,
      listening_port_count: 0,
      largest_snapshot_bytes: machine.snapshots.reduce((max, snap) => {
        return Math.max(max, snap.snapshot_size_bytes ?? 0);
      }, 0),
    };
  });

  // Sort by latest_timestamp descending (most recent first)
  machines.sort((a, b) => {
    if (!a.latest_timestamp) return 1;
    if (!b.latest_timestamp) return -1;
    return b.latest_timestamp.localeCompare(a.latest_timestamp);
  });

  return NextResponse.json(machines, {
    headers: { 'Cache-Control': LIST_CACHE_CONTROL },
  });
}
