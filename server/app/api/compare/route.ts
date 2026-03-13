import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_API_SECRET_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  return key === (process.env.API_SECRET_KEY || DEFAULT_API_SECRET_KEY);
}

// POST /api/compare — compare two snapshots by ID
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { baseline_id, after_id } = body;

  if (!baseline_id || !after_id) {
    return NextResponse.json({ error: 'baseline_id and after_id are required' }, { status: 400 });
  }
  const [{ data: baselineRow, error: err1 }, { data: afterRow, error: err2 }] = await Promise.all([
    getSupabase().from('snapshots').select('data').eq('id', baseline_id).single(),
    getSupabase().from('snapshots').select('data').eq('id', after_id).single(),
  ]);

  if (err1 || err2 || !baselineRow || !afterRow) {
    return NextResponse.json({ error: 'One or both snapshots not found' }, { status: 404 });
  }

  const baseline = baselineRow.data;
  const after = afterRow.data;

  const baselineProcessNames = new Set(baseline.running_processes.map((p: any) => p.name));
  const afterProcessNames = new Set(after.running_processes.map((p: any) => p.name));

  const newProcesses = after.running_processes.filter((p: any) => !baselineProcessNames.has(p.name));
  const removedProcesses = baseline.running_processes.filter((p: any) => !afterProcessNames.has(p.name));

  const processChanges = after.running_processes
    .map((afterProc: any) => {
      const baselineProc = baseline.running_processes.find((p: any) => p.name === afterProc.name);
      if (!baselineProc) return null;
      const cpu_change = afterProc.cpu_usage - baselineProc.cpu_usage;
      const mem_change = afterProc.mem_usage - baselineProc.mem_usage;
      if (Math.abs(cpu_change) <= 0.5 && Math.abs(mem_change) <= 0.5) return null;
      return {
        name: afterProc.name,
        cpu_change, mem_change,
        cpu_before: baselineProc.cpu_usage,
        cpu_after: afterProc.cpu_usage,
        mem_before: baselineProc.mem_usage,
        mem_after: afterProc.mem_usage,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    baseline_timestamp: baseline.metadata.timestamp,
    after_timestamp: after.metadata.timestamp,
    time_diff_minutes: Math.round(
      (new Date(after.metadata.timestamp).getTime() - new Date(baseline.metadata.timestamp).getTime()) / 60000
    ),
    new_processes: newProcesses,
    removed_processes: removedProcesses,
    process_changes: processChanges,
    memory_change_gb: (
      parseFloat(after.system.used_memory_gb) - parseFloat(baseline.system.used_memory_gb)
    ).toFixed(2),
    new_listening_ports: after.network.listening_ports.filter(
      (p: any) => !baseline.network.listening_ports.some((bp: any) => bp.local_port === p.local_port)
    ),
  });
}
