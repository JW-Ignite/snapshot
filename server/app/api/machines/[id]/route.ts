import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

type SnapshotStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';
type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';

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

// GET /api/machines/[id] — get machine detail with all snapshots
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: machineId } = await params;

  // Fetch all snapshots for this machine
  const { data, error } = await getSupabase()
    .from('snapshots')
    .select('id, machine_id, machine_name, snapshot_name, timestamp, data')
    .eq('machine_id', machineId)
    .order('timestamp', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
  }

  const latestSnapshot = data[0];
  const latestData = latestSnapshot?.data;

  // Build snapshot list (without full data to reduce payload)
  const snapshots = data.map(row => ({
    id: row.id,
    snapshot_name: row.snapshot_name,
    timestamp: row.timestamp,
    status: extractStatus(row.data),
    size_bytes: estimateSnapshotSizeBytes(row.data),
    process_count: row.data?.running_processes?.length ?? 0,
    port_count: row.data?.network?.listening_ports?.length ?? 0,
    memory_used_gb: row.data?.system?.used_memory_gb ?? null,
  }));

  return NextResponse.json({
    machine_id: machineId,
    machine_name: latestSnapshot.machine_name,
    machine_type: inferMachineType(latestSnapshot.machine_name, machineId),
    snapshot_count: data.length,
    latest_timestamp: latestSnapshot.timestamp,
    snapshots,
    latest_data: latestData,
  });
}
