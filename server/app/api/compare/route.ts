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

function normalizeApplications(value: unknown): Array<{ name: string; source?: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { name: string; source?: string } => {
    return Boolean(item && typeof item === 'object' && typeof item.name === 'string');
  });
}

function normalizeStartupGroups(value: unknown): Array<{ scope?: string; items?: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { scope?: string; items?: string[] } => {
    return Boolean(item && typeof item === 'object');
  });
}

function flattenStartupItems(value: unknown): Array<{ scope: string; name: string; key: string }> {
  const groups = normalizeStartupGroups(value);
  return groups.flatMap(group => {
    const scope = typeof group.scope === 'string' && group.scope.length > 0 ? group.scope : 'unknown';
    const items = Array.isArray(group.items)
      ? group.items.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];

    return items.map(name => ({
      scope,
      name,
      key: `${scope}:${name}`,
    }));
  });
}

function flattenFilesystemEntries(value: unknown): Array<{ path: string; name: string; scope: string; type: string; hash?: string | null; size_bytes?: number; mtime_ms?: number }> {
  if (!Array.isArray(value)) return [];

  return (value as unknown[]).flatMap(group => {
    if (!group || typeof group !== 'object') return [];
    const scope = typeof (group as any).scope === 'string' ? (group as any).scope : 'unknown';
    const entries: unknown[] = Array.isArray((group as any).entries) ? (group as any).entries : [];

    return entries
      .filter((entry: unknown): entry is { path: string; name?: string; type?: string; hash?: string | null; size_bytes?: number; mtime_ms?: number } => {
        return Boolean(entry && typeof entry === 'object' && typeof (entry as any).path === 'string');
      })
      .map((entry) => ({
        path: entry.path,
        name: typeof entry.name === 'string' ? entry.name : entry.path,
        scope,
        type: typeof entry.type === 'string' ? entry.type : 'file',
        hash: typeof entry.hash === 'string' ? entry.hash : null,
        size_bytes: Number.isFinite(Number(entry.size_bytes)) ? Number(entry.size_bytes) : 0,
        mtime_ms: Number.isFinite(Number(entry.mtime_ms)) ? Number(entry.mtime_ms) : 0,
      }));
  });
}

function formatDelta(value: number, unit = ''): string {
  const rendered = Number.isInteger(value) ? String(value) : value.toFixed(2);
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${rendered}${unit}`;
}

function buildComparison(baseline: any, after: any) {
  const baselineProcesses = normalizeProcesses(baseline?.data?.running_processes);
  const afterProcesses = normalizeProcesses(after?.data?.running_processes);
  const baselinePorts = normalizePorts(baseline?.data?.network?.listening_ports);
  const afterPorts = normalizePorts(after?.data?.network?.listening_ports);
  const baselineApps = normalizeApplications(baseline?.data?.software?.installed_applications);
  const afterApps = normalizeApplications(after?.data?.software?.installed_applications);
  const baselineStartupItems = flattenStartupItems(baseline?.data?.startup?.launch_agents);
  const afterStartupItems = flattenStartupItems(after?.data?.startup?.launch_agents);
  const baselineFilesystemItems = flattenFilesystemEntries(baseline?.data?.filesystem_audit);
  const afterFilesystemItems = flattenFilesystemEntries(after?.data?.filesystem_audit);

  const baselineProcessNames = new Set(baselineProcesses.map(process => process.name));
  const afterProcessNames = new Set(afterProcesses.map(process => process.name));
  const baselineAppNames = new Set(baselineApps.map(app => app.name));
  const afterAppNames = new Set(afterApps.map(app => app.name));
  const baselineStartupKeys = new Set(baselineStartupItems.map(item => item.key));
  const afterStartupKeys = new Set(afterStartupItems.map(item => item.key));
  const baselineFilesystemByPath = new Map(baselineFilesystemItems.map(item => [item.path, item]));
  const afterFilesystemByPath = new Map(afterFilesystemItems.map(item => [item.path, item]));

  const newProcesses = afterProcesses.filter(process => !baselineProcessNames.has(process.name));
  const removedProcesses = baselineProcesses.filter(process => !afterProcessNames.has(process.name));
  const newApplications = afterApps.filter(app => !baselineAppNames.has(app.name));
  const removedApplications = baselineApps.filter(app => !afterAppNames.has(app.name));
  const newStartupItems = afterStartupItems.filter(item => !baselineStartupKeys.has(item.key));
  const removedStartupItems = baselineStartupItems.filter(item => !afterStartupKeys.has(item.key));
  const newFilesystemItems = afterFilesystemItems.filter(item => !baselineFilesystemByPath.has(item.path));
  const removedFilesystemItems = baselineFilesystemItems.filter(item => !afterFilesystemByPath.has(item.path));
  const modifiedFilesystemItems = afterFilesystemItems
    .map(afterItem => {
      const baselineItem = baselineFilesystemByPath.get(afterItem.path);
      if (!baselineItem) return null;

      const hashChanged = Boolean(baselineItem.hash && afterItem.hash && baselineItem.hash !== afterItem.hash);
      const sizeChanged = baselineItem.size_bytes !== afterItem.size_bytes;
      const mtimeChanged = baselineItem.mtime_ms !== afterItem.mtime_ms;

      if (!hashChanged && !sizeChanged && !mtimeChanged) return null;

      return {
        ...afterItem,
        hash_changed: hashChanged,
        size_changed: sizeChanged,
        mtime_changed: mtimeChanged,
        baseline_size_bytes: baselineItem.size_bytes,
        baseline_mtime_ms: baselineItem.mtime_ms,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

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
  const memoryChangeGb = Number((afterMemory - baselineMemory).toFixed(2));

  const recentAddedFiles = newFilesystemItems
    .filter(item => item.type === 'file')
    .sort((a, b) => (b.mtime_ms || 0) - (a.mtime_ms || 0))
    .slice(0, 25);

  const concerns: Array<{ severity: 'high' | 'medium' | 'low'; title: string; detail?: string }> = [];

  if (newListeningPorts.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newListeningPorts.length} new listening port${newListeningPorts.length === 1 ? '' : 's'} detected`,
      detail: newListeningPorts.slice(0, 5).map(port => `${port.protocol || 'tcp'} ${port.local_address || '0.0.0.0'}:${port.local_port} (${port.process_name || 'unknown'})`).join(' • '),
    });
  }

  if (newApplications.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newApplications.length} new application${newApplications.length === 1 ? '' : 's'} detected`,
      detail: newApplications.slice(0, 8).map(app => `${app.name}${app.source ? ` (${app.source})` : ''}`).join(' • '),
    });
  }

  if (newStartupItems.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${newStartupItems.length} new startup item${newStartupItems.length === 1 ? '' : 's'} detected`,
      detail: newStartupItems.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  if (recentAddedFiles.length > 0) {
    concerns.push({
      severity: 'high',
      title: `${recentAddedFiles.length} recently added file${recentAddedFiles.length === 1 ? '' : 's'} found`,
      detail: recentAddedFiles.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  if (removedProcesses.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedProcesses.length} process${removedProcesses.length === 1 ? '' : 'es'} disappeared`,
      detail: removedProcesses.slice(0, 5).map(proc => `${proc.name}${proc.pid ? ` (pid ${proc.pid})` : ''}`).join(' • '),
    });
  }

  if (removedApplications.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedApplications.length} application${removedApplications.length === 1 ? '' : 's'} removed`,
      detail: removedApplications.slice(0, 8).map(app => `${app.name}${app.source ? ` (${app.source})` : ''}`).join(' • '),
    });
  }

  if (removedStartupItems.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${removedStartupItems.length} startup item${removedStartupItems.length === 1 ? '' : 's'} removed`,
      detail: removedStartupItems.slice(0, 8).map(item => `${item.name} [${item.scope}]`).join(' • '),
    });
  }

  const notableProcessChanges = processChanges.filter(change => Math.abs(change.cpu_change) >= 15 || Math.abs(change.mem_change) >= 10);
  if (notableProcessChanges.length > 0) {
    concerns.push({
      severity: 'medium',
      title: `${notableProcessChanges.length} process${notableProcessChanges.length === 1 ? '' : 'es'} changed resources significantly`,
      detail: notableProcessChanges.slice(0, 5).map(change => `${change.name}: CPU ${formatDelta(change.cpu_change, '%')}, MEM ${formatDelta(change.mem_change, '%')}`).join(' • '),
    });
  }

  if (Math.abs(memoryChangeGb) >= 1) {
    concerns.push({
      severity: 'medium',
      title: `System memory changed by ${formatDelta(memoryChangeGb, ' GB')}`,
      detail: `Used memory moved from ${baselineMemory.toFixed(2)} GB to ${afterMemory.toFixed(2)} GB.`,
    });
  }

  const concernLevel: 'high' | 'medium' | 'low' = concerns.some(item => item.severity === 'high')
    ? 'high'
    : concerns.some(item => item.severity === 'medium')
      ? 'medium'
      : 'low';

  const concernText = concerns.length === 0
    ? 'No major concerns detected.'
    : concernLevel === 'high'
      ? 'High-impact changes detected. Review software, startup, and file additions.'
      : 'Moderate changes detected. Review before promoting this update.';

  const baselineTime = new Date(baseline?.timestamp).getTime();
  const afterTime = new Date(after?.timestamp).getTime();

  return {
    baseline_timestamp: baseline?.timestamp ?? null,
    after_timestamp: after?.timestamp ?? null,
    time_diff_minutes: Number.isFinite(afterTime) && Number.isFinite(baselineTime)
      ? Math.round((afterTime - baselineTime) / 60000)
      : 0,
    new_processes: newProcesses,
    removed_processes: removedProcesses,
    new_applications: newApplications,
    removed_applications: removedApplications,
    new_startup_items: newStartupItems,
    removed_startup_items: removedStartupItems,
    new_filesystem_items: newFilesystemItems,
    removed_filesystem_items: removedFilesystemItems,
    modified_filesystem_items: modifiedFilesystemItems,
    recent_added_files: recentAddedFiles,
    process_changes: processChanges,
    memory_change_gb: memoryChangeGb.toFixed(2),
    new_listening_ports: newListeningPorts,
    concerns,
    concern_summary: {
      level: concernLevel,
      text: concernText,
    },
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
