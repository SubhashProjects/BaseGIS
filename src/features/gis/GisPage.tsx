import { useCallback, useMemo, useRef, useState } from 'react';
import { GisMap } from './GisMap';
import { MapHierarchyNavigator, type MapNavigationTarget } from './MapHierarchyNavigator';
import { useGisLayers } from '../../services/layerService';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { getVisibleAssetsInBounds, type PowerGISAsset } from '../../services/powergisData';
import type { PowerGISUser } from '../../services/powergisData';

export function GisPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { boundaries, stats, loading, error } = usePowerGISData(currentUser, { loadAssets: false });
  const [assets, setAssets] = useState<PowerGISAsset[]>([]);
  const [viewportError, setViewportError] = useState('');
  const viewportRequest = useRef(0);
  const loadViewport = useCallback(async (bounds: { west: number; south: number; east: number; north: number }) => {
    const request = ++viewportRequest.current;
    try {
      const result = await getVisibleAssetsInBounds(bounds);
      if (request === viewportRequest.current) { setAssets(result.assets); setViewportError(''); }
    } catch (e: any) {
      if (request === viewportRequest.current) setViewportError(e?.message || 'Viewport data could not be loaded.');
    }
  }, []);
  const { layers } = useGisLayers();
  const [navigationTarget, setNavigationTarget] = useState<MapNavigationTarget | null>(null);

  const counts = useMemo(() => {
    const totals = stats?.byType ?? {};
    return layers.map((layer) => ({
      id: layer.id,
      label: layer.label,
      color: layer.color,
      count: Number(totals[layer.id] || 0),
    }));
  }, [stats, layers]);

  const hierarchyItems = useMemo(
    () =>
      [
        { label: 'Sub Division', value: currentUser.subdivision },
        { label: 'Division', value: currentUser.division },
        { label: 'Circle', value: currentUser.circle },
        { label: 'Department', value: currentUser.department },
        { label: 'Region', value: currentUser.region },
      ].filter((item) => Boolean(item.value && item.value.trim() !== '' && item.value !== '—')),
    [currentUser]
  );

  if (error) {
    return (
      <div className="content">
        <div className="notice error-notice">
          <b>GIS data unavailable</b>
          <br />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="content gis-content">
      {!loading && boundaries.length > 0 && (
        <MapHierarchyNavigator
          currentUser={currentUser}
          boundaries={boundaries}
          onNavigate={setNavigationTarget}
          onReset={() => setNavigationTarget(null)}
        />
      )}
      <div className="gis-workspace">
        <div className="panel gis-panel">
          {viewportError && <div className="notice error-notice">{viewportError}</div>}
          {loading ? (
            <div className="map-loading">Loading authorised map data…</div>
          ) : (
            <GisMap
              currentUser={currentUser}
              assets={assets}
              boundaries={boundaries}
              navigationTarget={navigationTarget}
              onViewportChange={loadViewport}
            />
          )}
        </div>
        <details className="gis-context-drawer">
          <summary>Map context &amp; inventory</summary>
          <aside className="gis-side">
          <div className="panel">
            <div className="panel-head">Logged-in user</div>
            <div className="gis-user">
              <b>{currentUser.displayName}</b>
              <span>{currentUser.role}</span>
              <small>
                {currentUser.region}
                {currentUser.subdivision
                  ? ` • ${currentUser.subdivision}`
                  : currentUser.division
                  ? ` • ${currentUser.division}`
                  : ''}
              </small>
            </div>
          </div>
          {hierarchyItems.length > 0 && (
            <div className="panel">
              <div className="panel-head">My hierarchy</div>
              <div className="hierarchy">
                {hierarchyItems.map((item) => (
                  <div key={item.label}>
                    <b>{item.label}</b>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="panel">
            <div className="panel-head">Visible inventory</div>
            <div className="inventory">
              {counts.map((item) => (
                <div key={item.id}>
                  <span>
                    <i className="layer-dot" style={{ background: item.color }} />
                    {item.label}
                  </span>
                  <b>{item.count}</b>
                </div>
              ))}
            </div>
          </div>
          </aside>
        </details>
      </div>
    </div>
  );
}
