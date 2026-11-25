import { useCallback, useEffect, useState } from 'react';
import { getVisibleAssets, getVisibleBoundaries, type PowerGISAsset, type PowerGISBoundary, type PowerGISUser } from '../services/powergisData';

export function usePowerGISData(user: PowerGISUser) {
  const [assets, setAssets] = useState<PowerGISAsset[]>([]);
  const [boundaries, setBoundaries] = useState<PowerGISBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([getVisibleAssets(user.id), getVisibleBoundaries(user.id)]);
      setAssets(a);
      setBoundaries(b);
    } catch (e: any) {
      setError(e.message || 'Unable to load authorised GIS data.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void loadData();
    const handleUpdate = () => {
      void loadData();
    };
    window.addEventListener('powergis:assets-changed', handleUpdate);
    return () => {
      window.removeEventListener('powergis:assets-changed', handleUpdate);
    };
  }, [loadData]);

  return { assets, boundaries, loading, error, refresh: loadData };
}
