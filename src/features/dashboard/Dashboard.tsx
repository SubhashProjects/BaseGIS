import { useMemo } from 'react';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { useGisLayers } from '../../services/layerService';
import type { PowerGISUser } from '../../services/powergisData';

const PALETTE = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#a855f7', '#64748b'];
const STATUS_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'];

function Icon({ name }: { name: 'assets' | 'active' | 'pending' | 'retired' | 'network' }) {
  const paths = {
    assets: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 21v-8.9" /></>,
    active: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    retired: <><path d="M4 7h16M7 7V4h10v3m-9 0 1 13h6l1-13" /><path d="M10 11v5m4-5v5" /></>,
    network: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-9-4 9M7 6h10" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function DonutChart({ values, labels, loading }: { values: number[]; labels: string[]; loading: boolean }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const circumference = 2 * Math.PI * 43;
  let offset = 0;

  return (
    <div className="pg-chart-layout">
      <div className="pg-donut-wrap">
        <svg viewBox="0 0 120 120" role="img" aria-label={`Asset distribution: ${labels.map((label, i) => `${label} ${values[i]}`).join(', ')}`}>
          <circle cx="60" cy="60" r="43" fill="none" stroke="#edf0f6" strokeWidth="12" />
          {total > 0 && values.map((value, index) => {
            const length = (value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const currentOffset = offset;
            offset += length;
            return <circle key={labels[index]} cx="60" cy="60" r="43" fill="none"
              stroke={PALETTE[index % PALETTE.length]} strokeWidth="12"
              strokeDasharray={dash} strokeDashoffset={-currentOffset}
              transform="rotate(-90 60 60)" />;
          })}
          <text x="60" y="56" textAnchor="middle" className="pg-donut-total">{loading ? '—' : total.toLocaleString()}</text>
          <text x="60" y="72" textAnchor="middle" className="pg-donut-caption">ASSETS</text>
        </svg>
      </div>
      <div className="pg-chart-legend">
        {labels.map((label, index) => (
          <div className="pg-legend-row" key={label}>
            <span><i style={{ background: PALETTE[index % PALETTE.length] }} />{label}</span>
            <b>{loading ? '—' : values[index].toLocaleString()}</b>
          </div>
        ))}
        {!loading && total === 0 && <p className="pg-muted">No asset records available yet.</p>}
      </div>
    </div>
  );
}

function BarChart({ values, labels, loading }: { values: number[]; labels: string[]; loading: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div className="pg-bar-chart" role="img" aria-label={`Asset status: ${labels.map((label, i) => `${label} ${values[i]}`).join(', ')}`}>
      {labels.map((label, index) => (
        <div className="pg-bar-row" key={label}>
          <div className="pg-bar-meta"><span>{label}</span><b>{loading ? '—' : values[index].toLocaleString()}</b></div>
          <div className="pg-bar-track"><span style={{ width: loading ? '0%' : `${(values[index] / max) * 100}%`, background: STATUS_COLORS[index] }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, stats, loading, error } = usePowerGISData(currentUser, { loadAssets: false });
  const { layers } = useGisLayers();

  // One pass through the asset collection keeps the dashboard efficient as the
  // network inventory grows.
  const summary = useMemo(() => {
    if (stats) {
      return { byType: stats.byType, active: stats.activeCount, pending: stats.pendingCount, retired: stats.retiredCount, other: stats.otherCount, total: stats.totalCount };
    }
    const byType: Record<string, number> = {};
    let active = 0;
    let pending = 0;
    let retired = 0;
    for (const asset of assets) {
      byType[asset.assetType] = (byType[asset.assetType] || 0) + 1;
      if (asset.status === 'ACTIVE') active += 1;
      else if (['DRAFT', 'SUBMITTED', 'JE_REVIEW', 'AE_REVIEW'].includes(asset.status)) pending += 1;
      else if (asset.status === 'RETIRED') retired += 1;
    }
    return { byType, active, pending, retired, other: Math.max(0, assets.length - active - pending - retired), total: assets.length };
  }, [assets, stats]);

  const counts = useMemo(() => layers.map((layer) => summary.byType[layer.id] || 0), [layers, summary]);
  const metrics = [
    { label: 'Total assets', value: summary.total, color: 'violet', icon: 'assets' as const, hint: 'All registered network assets' },
    { label: 'Active assets', value: summary.active, color: 'green', icon: 'active' as const, hint: 'Currently in service' },
    { label: 'Pending workflow', value: summary.pending, color: 'amber', icon: 'pending' as const, hint: 'Awaiting review or approval' },
    { label: 'Retired assets', value: summary.retired, color: 'rose', icon: 'retired' as const, hint: 'Marked out of service' },
  ];

  return (
    <div className="content pg-dashboard">
      

      <header className="pg-heading">
        <div>
          <p className="pg-eyebrow">PowerGIS / Overview</p>
          <h1 className="pg-title">Operations dashboard</h1>
          <p className="pg-subtitle">A clear view of your network assets and operational workflow.</p>
        </div>
        <div className={`pg-sync ${loading ? 'is-loading' : ''}`} aria-live="polite">
          <span className="pg-sync-dot" />
          {loading ? 'Updating dashboard' : 'Dashboard up to date'}
        </div>
      </header>

      {error && <div className="pg-notice pg-error" role="alert"><strong>Dashboard data unavailable.</strong><span>{error}</span></div>}

      <section className="pg-metrics" aria-label="Asset summary">
        {metrics.map((metric) => (
          <article className={`pg-metric pg-${metric.color}`} key={metric.label}>
            <div className="pg-metric-head">
              <span className="pg-metric-label">{metric.label}</span>
              <span className="pg-metric-icon"><Icon name={metric.icon} /></span>
            </div>
            <div className="pg-metric-value">{loading ? '—' : metric.value.toLocaleString()}</div>
            <div className="pg-metric-hint">{metric.hint}</div>
          </article>
        ))}
      </section>

      <section className="pg-panels" aria-label="Asset analytics">
        <article className="pg-panel">
          <div className="pg-panel-head">
            <div><h2 className="pg-panel-title">Asset composition</h2><p className="pg-panel-sub">Distribution across network layers</p></div>
            <span className="pg-tag">INVENTORY</span>
          </div>
          <div className="pg-panel-body">
            <DonutChart values={counts} labels={layers.map((layer) => layer.label)} loading={loading} />
          </div>
        </article>
        <article className="pg-panel">
          <div className="pg-panel-head">
            <div><h2 className="pg-panel-title">Asset lifecycle</h2><p className="pg-panel-sub">Current operational status</p></div>
            <span className="pg-tag">STATUS</span>
          </div>
          <div className="pg-panel-body">
            <BarChart labels={['Active', 'Pending', 'Retired', 'Other']} values={[summary.active, summary.pending, summary.retired, summary.other]} loading={loading} />
          </div>
        </article>
      </section>

      <section className="pg-panel">
        <div className="pg-panel-head">
          <div><h2 className="pg-panel-title">Network layer inventory</h2><p className="pg-panel-sub">Asset count grouped by mapped layer</p></div>
          <span className="pg-tag">{loading ? 'LOADING' : `${layers.length} LAYERS`}</span>
        </div>
        {layers.length > 0 ? (
          <div className="pg-layer-grid">
            {layers.map((layer, index) => (
              <div className="pg-layer-item" key={layer.id}>
                <span className="pg-layer-swatch" style={{ background: layer.color || PALETTE[index % PALETTE.length] }} />
                <span className="pg-layer-name" title={layer.label}>{layer.label}</span>
                <b className="pg-layer-count">{loading ? '—' : counts[index].toLocaleString()}</b>
              </div>
            ))}
          </div>
        ) : <div className="pg-empty">No network layers are configured.</div>}
      </section>
    </div>
  );
}
