import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_API_SECRET_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  return key === (process.env.API_SECRET_KEY || DEFAULT_API_SECRET_KEY);
}

// POST /api/compare — return IDs of both snapshots so client can compare locally
// This avoids downloading massive snapshot data blobs just to compute differences.
// Comparisons should happen in the Electron app where the full snapshots are already cached.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { baseline_id, after_id } = body;

  if (!baseline_id || !after_id) {
    return NextResponse.json({ error: 'baseline_id and after_id are required' }, { status: 400 });
  }

  // Just verify both snapshots exist; don't fetch the massive data blobs
  const [baselineCheck, afterCheck] = await Promise.all([
    getSupabase().from('snapshots').select('id, snapshot_name, timestamp').eq('id', baseline_id).single(),
    getSupabase().from('snapshots').select('id, snapshot_name, timestamp').eq('id', after_id).single(),
  ]);

  if (baselineCheck.error || afterCheck.error || !baselineCheck.data || !afterCheck.data) {
    return NextResponse.json({ error: 'One or both snapshots not found' }, { status: 404 });
  }

  // Client is responsible for performing comparison on the full data already cached locally
  return NextResponse.json({
    message: 'Both snapshots exist. Perform comparison locally using the full snapshot data.',
    baseline_id,
    after_id,
    baseline_snapshot_name: baselineCheck.data.snapshot_name,
    after_snapshot_name: afterCheck.data.snapshot_name,
  });
}
