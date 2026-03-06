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
  const router = useRouter();

  const apiKey = process.env.NEXT_PUBLIC_API_KEY || DEFAULT_API_KEY;

  useEffect(() => {
    let isMounted = true;

    const loadMachines = async () => {
      try {
        const res = await fetch('/api/machines', {
          headers: { 'x-api-key': apiKey }
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        if (isMounted) {
          setMachines(Array.isArray(data) ? data : []);
          setError('');
          setLoading(false);
        }
      } catch (e: any) {
        if (isMounted) {
          setError(`Failed to load machines: ${e.message}`);
          setLoading(false);
        }
      }
    };

    loadMachines();
    const interval = setInterval(loadMachines, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiKey]);

  const handleSelectMachine = (machineId: string) => {
    router.push(`/dashboard/machines/${encodeURIComponent(machineId)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading machines...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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
        <h2 className="text-2xl font-bold text-gray-800">Machine Overview</h2>
        <p className="text-gray-500 mt-1">
          {machines.length} machines connected. Click a card to view details and compare snapshots.
        </p>
      </div>

      {/* Machine Grid */}
      <MachineCardGrid
        machines={machines}
        onSelectMachine={handleSelectMachine}
      />
    </div>
  );
}
