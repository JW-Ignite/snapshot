import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_API_SECRET_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  return key === (process.env.API_SECRET_KEY || DEFAULT_API_SECRET_KEY);
}

function estimateSnapshotSizeBytes(payload: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(payload || {}), 'utf8'); }
  catch { return 0; }
}

function extractStatus(data: any): string {
  const candidate = data?.metadata?.snapshot_status || data?.metadata?.status;
  if (typeof candidate !== 'string') return 'Completed';
  const n = candidate.trim().toLowerCase();
  if (n === 'pending') return 'Pending';
  if (n === 'running') return 'Running';
  if (n === 'failed') return 'Failed';
  return 'Completed';
}

function extractStatusError(data: any): string | null {
  const error = data?.metadata?.error || data?.metadata?.failure_reason || null;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return null;
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
    (
      (value.includes('column') && value.includes('does not exist')) ||
      value.includes('schema cache')
    )
  );
}

// GET /api/snapshots/[id] — load full snapshot data
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await getSupabase()
    .from('snapshots')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE /api/snapshots/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await getSupabase()
    .from('snapshots')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// PATCH /api/snapshots/[id] — update snapshot metadata/data (used for lifecycle statuses)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.snapshot_name) updates.snapshot_name = body.snapshot_name;
    if (body.machine_name) updates.machine_name = body.machine_name;
    if (body.timestamp) updates.timestamp = body.timestamp;
    if (body.data) {
      updates.data = body.data;
      // Keep derived columns in sync so the list endpoint never needs to fetch data
      updates.snapshot_status = extractStatus(body.data);
      updates.snapshot_size_bytes = estimateSnapshotSizeBytes(body.data);
      updates.snapshot_error = extractStatusError(body.data);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const fullUpdate = await getSupabase()
      .from('snapshots')
      .update(updates)
      .eq('id', id)
      .select('id')
      .single();

    if (!fullUpdate.error) {
      return NextResponse.json({ success: true, id: fullUpdate.data.id });
    }

    if (!isMissingDerivedSnapshotColumnsError(fullUpdate.error.message)) {
      return NextResponse.json({ error: fullUpdate.error.message }, { status: 500 });
    }

    const { snapshot_status, snapshot_size_bytes, snapshot_error, ...legacyUpdates } = updates;
    const legacyUpdate = await getSupabase()
      .from('snapshots')
      .update(legacyUpdates)
      .eq('id', id)
      .select('id')
      .single();

    if (legacyUpdate.error) {
      return NextResponse.json({ error: legacyUpdate.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: legacyUpdate.data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Update failed' }, { status: 500 });
  }
}
