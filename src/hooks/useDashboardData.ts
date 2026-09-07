import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { buildDashboardFromUnits, dashboardUnits } from '@/lib/dashboard-data';
import type { Property } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export function useDashboardData(propertyId: string) {
  const userId = useAuth().user?.id;
  const queryKey = `${userId ?? ''}:${propertyId}`;
  const [data, setData] = useState({
    ...buildDashboardFromUnits([]),
    properties: [] as Property[],
    queryKey: '',
    loading: true,
    error: null as string | null,
  });
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!userId) return;
      async function fetchData() {
        try {
          if (!supabase) throw new Error('Sign in');
          const [properties, units, walkthroughs, turnovers] =
            await Promise.all([
              supabase.from('properties').select('*').order('name'),
              supabase.from('units').select('*'),
              supabase
                .from('walkthroughs')
                .select('*')
                .eq('status', 'complete'),
              supabase.from('turnovers').select('unit_id,stage,started_at'),
            ]);
          if (
            properties.error ||
            units.error ||
            walkthroughs.error ||
            turnovers.error
          )
            throw new Error('Load failed');
          const cards = dashboardUnits(
            (units.data ?? []).filter(
              (u) => !propertyId || u.property_id === propertyId
            ),
            walkthroughs.data ?? [],
            turnovers.data ?? []
          );
          if (!cancelled)
            setData({
              ...buildDashboardFromUnits(cards),
              properties: properties.data ?? [],
              queryKey,
              loading: false,
              error: null,
            });
        } catch {
          if (!cancelled)
            setData({
              ...buildDashboardFromUnits([]),
              properties: [],
              queryKey,
              loading: false,
              error: 'Could not load this property.',
            });
        }
      }
      void fetchData();
      return () => {
        cancelled = true;
      };
    }, [propertyId, userId, queryKey])
  );
  return data.queryKey === queryKey
    ? data
    : {
        ...buildDashboardFromUnits([]),
        properties: [],
        loading: true,
        error: null,
      };
}
