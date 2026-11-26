import { useCallback, useEffect, useRef, useState } from 'react';
import { PERFORMANCE } from '../config/performance.config';
import { getVisibleAssetStats, getVisibleAssets, getVisibleBoundaries, type AssetStats, type PowerGISAsset, type PowerGISBoundary, type PowerGISUser } from '../services/powergisData';

type Options = { loadAssets?: boolean };

export function usePowerGISData(user: PowerGISUser, options: Options = {}) {
  const loadAssets = options.loadAssets !== false;
  const [assets, setAssets] = useState<PowerGISAsset[]>([]);
  const [boundaries, setBoundaries] = useState<PowerGISBoundary[]>([]);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [assetResult, boundaryResult, statResult] = await Promise.all([
        loadAssets ? getVisibleAssets(user.id) : Promise.resolve([] as PowerGISAsset[]),
        getVisibleBoundaries(user.id),
        getVisibleAssetStats(),
      ]);
      const resolvedAssets = loadAssets ? assetResult : [];
      if (currentRequest !== requestId.current) return;
      setAssets(resolvedAssets);
      setBoundaries(boundaryResult);
      setStats(statResult);
    } catch (e: any) {
      if (currentRequest === requestId.current) setError(e.message || 'Unable to load authorised GIS data.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [user.id, loadAssets]);

  useEffect(() => {
    void loadData();
    let timer: number | undefined;
    const handleUpdate = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadData(), PERFORMANCE.refreshDebounceMs);
    };
    window.addEventListener('powergis:assets-changed', handleUpdate);
    return () => {
      if (timer) window.clearTimeout(timer);
      requestId.current += 1;
      window.removeEventListener('powergis:assets-changed', handleUpdate);
    };
  }, [loadData]);

  return { assets, boundaries, stats, loading, error, refresh: loadData };
}
