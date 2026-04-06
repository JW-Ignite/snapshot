'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MachineCardGrid } from '@/app/components/engineer/MachineCardGrid';
import { HealthStatus } from '@/app/components/engineer/HealthIndicator';

type MachineType = 'Laptop' | 'Desktop' | 'Server' | 'Virtual Machine' | 'Unknown';

interface MachineData {
  machine_id: string;
  machine_name: string;
  machine_type: MachineType;
  snapshot_count: number;
  latest_timestamp: string;
  health_status: HealthStatus;
  latest_memory_gb?: number | null;
  total_memory_gb?: number | null;
  latest_cpu_cores?: number | null;
  cpu_brand?: string | null;
  os_info?: string | null;
  active_process_count: number;
  listening_port_count: number;
  largest_snapshot_bytes: number;
}

const DEFAULT_API_KEY = 'sb_publishable_4cRWlmo693rt6aPU8Tmqjg_ZDnfLWJV';

export default function EngineerPage() {
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const apiKey = process.env.NEXT_PUBLIC_API_KEY || DEFAULT_API_KEY;

  const loadMachines = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/machines', {
        headers: { 'x-api-key': apiKey }
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
      setError('');
    } catch (e: any) {
      setError(`Failed to load machines: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMachines();
  }, [apiKey]);

  const handleSelectMachine = (machineId: string) => {
    router.push(`/dashboard/machines/${encodeURIComponent(machineId)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
          <p className="text-zinc-500">Loading machines...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card app-card-inner text-center">
        <p className="text-red-300">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="app-btn app-btn-danger mt-4"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Machine Overview</h2>
            <p className="mt-1 text-zinc-500">
              {machines.length} machines connected. Manual refresh only to keep background traffic near zero.
            </p>
          </div>
          <button
            onClick={loadMachines}
            disabled={refreshing}
            className="app-btn app-btn-primary"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Machine Grid */}
      <MachineCardGrid
        machines={machines}
        onSelectMachine={handleSelectMachine}
      />
    </div>
  );
}
