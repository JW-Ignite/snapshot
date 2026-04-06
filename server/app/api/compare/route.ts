import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_API_SECRET_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';
const DETAIL_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  return key === (process.env.API_SECRET_KEY || DEFAULT_API_SECRET_KEY);
}

function normalizeProcesses(value: unknown): Array<{ name: string; pid?: number; cpu_usage?: number; mem_usage?: number }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { name: string; pid?: number; cpu_usage?: number; mem_usage?: number } => {
    return Boolean(item && typeof item === 'object' && typeof item.name === 'string');
  });
}

function normalizePorts(value: unknown): Array<{ process_name?: string; pid?: number; protocol?: string; local_port: number; local_address?: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { process_name?: string; pid?: number; protocol?: string; local_port: number; local_address?: string } => {
    return Boolean(item && typeof item === 'object' && typeof item.local_port === 'number');
  });
}

function buildComparison(baseline: any, after: any) {
  const baselineProcesses = normalizeProcesses(baseline?.data?.running_processes);
  const afterProcesses = normalizeProcesses(after?.data?.running_processes);
  const baselinePorts = normalizePorts(baseline?.data?.network?.listening_ports);
  const afterPorts = normalizePorts(after?.data?.network?.listening_ports);

  const baselineProcessNames = new Set(baselineProcesses.map(process => process.name));
  const afterProcessNames = new Set(afterProcesses.map(process => process.name));

  const newProcesses = afterProcesses.filter(process => !baselineProcessNames.has(process.name));
  const removedProcesses = baselineProcesses.filter(process => !afterProcessNames.has(process.name));

  const processChanges = afterProcesses
    .map(afterProcess => {
      const baselineProcess = baselineProcesses.find(process => process.name === afterProcess.name);
      if (!baselineProcess) return null;

      const cpuBefore = Number(baselineProcess.cpu_usage ?? 0);
      const cpuAfter = Number(afterProcess.cpu_usage ?? 0);
      const memBefore = Number(baselineProcess.mem_usage ?? 0);
      const memAfter = Number(afterProcess.mem_usage ?? 0);

      return {
        name: afterProcess.name,
        cpu_change: cpuAfter - cpuBefore,
        mem_change: memAfter - memBefore,
        cpu_before: cpuBefore,
        cpu_after: cpuAfter,
        mem_before: memBefore,
        mem_after: memAfter,
      };
    })
    .filter((change): change is NonNullable<typeof change> => Boolean(change))
    .filter(change => Math.abs(change.cpu_change) > 0.5 || Math.abs(change.mem_change) > 0.5);

  const baselinePortsByKey = new Set(
    baselinePorts.map(port => `${port.protocol || ''}:${port.local_port}:${port.local_address || ''}`)
  );

  const newListeningPorts = afterPorts.filter(port => {
    const key = `${port.protocol || ''}:${port.local_port}:${port.local_address || ''}`;
    return !baselinePortsByKey.has(key);
  });

  const baselineMemory = Number(baseline?.data?.system?.used_memory_gb ?? 0);
  const afterMemory = Number(after?.data?.system?.used_memory_gb ?? 0);

  return {
    baseline_timestamp: baseline?.timestamp ?? null,
    after_timestamp: after?.timestamp ?? null,
    time_diff_minutes: Math.round((new Date(after?.timestamp).getTime() - new Date(baseline?.timestamp).getTime()) / 60000),
    new_processes: newProcesses,
    removed_processes: removedProcesses,
    process_changes: processChanges,
    memory_change_gb: (afterMemory - baselineMemory).toFixed(2),
    new_listening_ports: newListeningPorts,
  };
}

// POST /api/compare — compare two snapshots server-side using the stored snapshot payloads.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { baseline_id, after_id } = body;

  if (!baseline_id || !after_id) {
    return NextResponse.json({ error: 'baseline_id and after_id are required' }, { status: 400 });
  }

  const [baselineCheck, afterCheck] = await Promise.all([
    getSupabase().from('snapshots').select('id, snapshot_name, timestamp, data').eq('id', baseline_id).single(),
    getSupabase().from('snapshots').select('id, snapshot_name, timestamp, data').eq('id', after_id).single(),
  ]);

  if (baselineCheck.error || afterCheck.error || !baselineCheck.data || !afterCheck.data) {
    return NextResponse.json({ error: 'One or both snapshots not found' }, { status: 404 });
  }

  const comparison = buildComparison(baselineCheck.data, afterCheck.data);

  return NextResponse.json({
    ...comparison,
    baseline_id,
    after_id,
    baseline_snapshot_name: baselineCheck.data.snapshot_name,
    after_snapshot_name: afterCheck.data.snapshot_name,
  }, {
    headers: { 'Cache-Control': DETAIL_CACHE_CONTROL },
  });
}
