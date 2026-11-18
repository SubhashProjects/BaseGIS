import { useMemo } from 'react';
import { GisMap } from './GisMap';
import { ASSET_COLORS, ASSET_LABELS } from '../../config/constants';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import type { PowerGISUser } from '../../services/powergisData';

export function GisPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, boundaries, loading, error } = usePowerGISData(currentUser);
  const counts = useMemo(
    () => Object.keys(ASSET_LABELS).map((k) => [k, assets.filter((a) => a.assetType === k).length] as const),
    [assets]
  );

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
      <div className="gis-workspace">
        <div className="panel gis-panel">
          {loading ? (
            <div className="map-loading">Loading authorised map data…</div>
          ) : (
            <GisMap currentUser={currentUser} assets={assets} boundaries={boundaries} />
          )}
        </div>
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
              {counts.map(([k, v]) => (
                <div key={k}>
                  <span>
                    <i className="layer-dot" style={{ background: ASSET_COLORS[k] }} />
                    {ASSET_LABELS[k]}
                  </span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
