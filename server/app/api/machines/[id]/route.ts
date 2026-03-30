import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';
type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';
const DETAIL_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

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

function inferMachineType(machineName: string, machineId: string): MachineType {
  const value = `${machineName} ${machineId}`.toLowerCase();
  if (value.includes('server')) return 'Server';
  if (value.includes('vm') || value.includes('virtual') || value.includes('hyper-v') || value.includes('wsl')) return 'Virtual Machine';
  if (value.includes('macbook') || value.includes('laptop') || value.includes('notebook')) return 'Laptop';
  if (value.includes('desktop') || value.includes('workstation') || value.includes('imac')) return 'Desktop';
  return 'Unknown';
}

function estimateSnapshotSizeBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
  } catch {
    return 0;
  }
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

// GET /api/machines/[id] — get machine detail with one full latest snapshot and lightweight history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: machineId } = await params;

  const latestSnapshotQuery = await getSupabase()
    .from('snapshots')
    .select('id, machine_id, machine_name, snapshot_name, timestamp, data')
    .eq('machine_id', machineId)
    .order('timestamp', { ascending: false });

  if (latestSnapshotQuery.error) {
    return NextResponse.json({ error: latestSnapshotQuery.error.message }, { status: 500 });
  }

  const latestRows = latestSnapshotQuery.data || [];
  if (latestRows.length === 0) {
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
  }

  const latestSnapshot = latestRows[0];

  const metadataQuery = await getSupabase()
    .from('snapshots')
    .select('id, snapshot_name, timestamp, snapshot_status, snapshot_size_bytes')
    .eq('machine_id', machineId)
    .order('timestamp', { ascending: false });

  let snapshots: Array<{
    id: string;
    snapshot_name: string;
    timestamp: string;
    status: SnapshotStatus;
    size_bytes: number;
    process_count?: number | null;
    port_count?: number | null;
    memory_used_gb?: number | null;
  }> = [];

  if (!metadataQuery.error) {
    snapshots = (metadataQuery.data || []).map((row: any) => ({
      id: row.id,
      snapshot_name: row.snapshot_name,
      timestamp: row.timestamp,
      status: normalizeStatus(row.snapshot_status),
      size_bytes: row.snapshot_size_bytes ?? 0,
      process_count: null,
      port_count: null,
      memory_used_gb: null,
    }));
  } else {
    if (!isMissingDerivedSnapshotColumnsError(metadataQuery.error.message)) {
      return NextResponse.json({ error: metadataQuery.error.message }, { status: 500 });
    }

    const legacyMetadataQuery = await getSupabase()
      .from('snapshots')
      .select('id, snapshot_name, timestamp')
      .eq('machine_id', machineId)
      .order('timestamp', { ascending: false });

    if (legacyMetadataQuery.error) {
      return NextResponse.json({ error: legacyMetadataQuery.error.message }, { status: 500 });
    }

    snapshots = (legacyMetadataQuery.data || []).map((row: any) => ({
      id: row.id,
      snapshot_name: row.snapshot_name,
      timestamp: row.timestamp,
      status: 'Completed' as SnapshotStatus,
      size_bytes: 0,
      process_count: null,
      port_count: null,
      memory_used_gb: null,
    }));
  }

  const latestProcesses = Array.isArray(latestSnapshot.data?.running_processes)
    ? latestSnapshot.data.running_processes.slice(0, 20)
    : [];
  const latestListeningPorts = Array.isArray(latestSnapshot.data?.network?.listening_ports)
    ? latestSnapshot.data.network.listening_ports.slice(0, 15)
    : [];

  return NextResponse.json({
    machine_id: machineId,
    machine_name: latestSnapshot.machine_name,
    machine_type: inferMachineType(latestSnapshot.machine_name, machineId),
    snapshot_count: snapshots.length,
    latest_timestamp: latestSnapshot.timestamp,
    snapshots,
    latest_system: latestSnapshot.data?.system ?? null,
    latest_processes: latestProcesses,
    latest_process_count: Array.isArray(latestSnapshot.data?.running_processes) ? latestSnapshot.data.running_processes.length : 0,
    latest_listening_ports: latestListeningPorts,
    latest_port_count: Array.isArray(latestSnapshot.data?.network?.listening_ports) ? latestSnapshot.data.network.listening_ports.length : 0,
    latest_snapshot_size_bytes: estimateSnapshotSizeBytes(latestSnapshot.data),
    latest_status: extractStatus(latestSnapshot.data),
  }, {
    headers: { 'Cache-Control': DETAIL_CACHE_CONTROL },
  });
}
