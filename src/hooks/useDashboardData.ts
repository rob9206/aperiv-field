import { useEffect, useState } from 'react';

import {
  buildDashboardFromUnits,
  type DashboardColumns,
  type DashboardMetrics,
} from '@/lib/dashboard-data';
import { supabase } from '@/lib/supabase';

export interface DashboardData {
  metrics: DashboardMetrics;
  columns: DashboardColumns;
  loading: boolean;
  error: string | null;
}

const emptyDashboard: DashboardData = {
  metrics: { progress: 0, awaitingReview: 0, totalSqft: 0, activeCrew: 0 },
  columns: { toDo: [], inProgress: [], needsReview: [], approved: [] },
  loading: true,
  error: null,
};

export function useDashboardData(propertyId: string) {
  const [data, setData] = useState<DashboardData>(emptyDashboard);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!propertyId) {
        setData({
          ...emptyDashboard,
          loading: false,
          error: 'Could not load this property.',
        });
        return;
      }

      if (!supabase) {
        setData({
          ...emptyDashboard,
          loading: false,
          error: 'Could not load this property.',
        });
        return;
      }

      try {
        const { data: units, error: unitsError } = await supabase
          .from('units')
          .select('*')
          .eq('property_id', propertyId);

        if (unitsError) {
          throw unitsError;
        }

        const snapshot = buildDashboardFromUnits(units ?? []);
        if (!cancelled) {
          setData({
            metrics: snapshot.metrics,
            columns: snapshot.columns,
            loading: false,
            error: null,
          });
        }
      } catch {
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: 'Could not load this property.',
          }));
        }
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return data;
}
