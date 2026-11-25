import { useMemo } from 'react';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { useGisLayers } from '../../services/layerService';
import type { PowerGISUser } from '../../services/powergisData';

const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#a855f7', '#64748b'];

function DonutChart({ values, labels }: { values: number[]; labels: string[] }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  let offset = 0;
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="chart-layout">
      <div className="donut-wrap" role="img" aria-label={`Asset distribution: ${labels.map((label, i) => `${label} ${values[i]}`).join(', ')}`}>
        <svg viewBox="0 0 120 120" className="donut-chart">
          <circle cx="60" cy="60" r="42" fill="none" stroke="var(--chart-track)" strokeWidth="13" />
          {total > 0 && values.map((value, index) => {
            const length = (value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const currentOffset = offset;
            offset += length;
            return <circle key={labels[index]} cx="60" cy="60" r="42" fill="none" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth="13" strokeDasharray={dash} strokeDashoffset={-currentOffset} transform="rotate(-90 60 60)" />;
          })}
          <text x="60" y="57" textAnchor="middle" className="donut-total">{total.toLocaleString()}</text>
          <text x="60" y="72" textAnchor="middle" className="donut-caption">ASSETS</text>
        </svg>
      </div>
      <div className="chart-legend">
        {labels.map((label, index) => <div className="legend-row" key={label}><span><i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />{label}</span><b>{values[index].toLocaleString()}</b></div>)}
        {total === 0 && <p className="muted">No asset records available</p>}
      </div>
    </div>
  );
}

function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return <div className="bar-chart" role="img" aria-label={`Asset status: ${labels.map((label, i) => `${label} ${values[i]}`).join(', ')}`}>
    {labels.map((label, index) => <div className="bar-row" key={label}><span className="bar-label">{label}</span><div className="bar-track"><span style={{ width: `${(values[index] / max) * 100}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></div><b>{values[index].toLocaleString()}</b></div>)}
  </div>;
}

export function Dashboard({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, loading, error } = usePowerGISData(currentUser);
  const { layers } = useGisLayers();
  const counts = useMemo(() => layers.map((layer) => assets.filter((asset) => asset.assetType === layer.id).length), [assets, layers]);
  const activeCount = assets.filter((asset) => asset.status === 'ACTIVE').length;
  const pendingCount = assets.filter((asset) => ['DRAFT', 'SUBMITTED', 'JE_REVIEW', 'AE_REVIEW'].includes(asset.status)).length;
  const retiredCount = assets.filter((asset) => asset.status === 'RETIRED').length;
  const metrics = [
    { label: 'Total assets', value: assets.length, color: 'indigo', icon: '◈' },
    { label: 'Active assets', value: activeCount, color: 'green', icon: '✓' },
    { label: 'Pending workflow', value: pendingCount, color: 'amber', icon: '◷' },
    { label: 'Retired assets', value: retiredCount, color: 'rose', icon: '↘' },
  ];

  return <div className="content dashboard-content">
    <div className="dashboard-welcome">
      <div><h1>Operations dashboard</h1></div>
      {loading && <div className="dashboard-live"><span /> Syncing data</div>}
    </div>
    {error && <div className="notice error-notice" role="alert"><b>Dashboard data unavailable</b><br />{error}</div>}
    <div className="cards dashboard-metrics">
      {metrics.map((metric) => <article className={`card metric-card metric-${metric.color}`} key={metric.label}>
        <div className="metric-card-top"><span className="metric-label">{metric.label}</span><span className="metric-icon" aria-hidden="true">{metric.icon}</span></div>
        <div className="metric">{loading ? '—' : metric.value.toLocaleString()}</div>
      </article>)}
    </div>
    <div className="dashboard-charts">
      <section className="panel chart-panel"><div className="panel-head"><div><b>Asset composition</b></div><span className="chart-kicker">INVENTORY</span></div><div className="panel-body"><DonutChart values={counts} labels={layers.map((layer) => layer.label)} /></div></section>
      <section className="panel chart-panel"><div className="panel-head"><div><b>Asset lifecycle</b></div><span className="chart-kicker">STATUS</span></div><div className="panel-body"><BarChart labels={['Active', 'Pending', 'Retired', 'Other']} values={[activeCount, pendingCount, retiredCount, Math.max(0, assets.length - activeCount - pendingCount - retiredCount)]} /></div></section>
    </div>
    <section className="panel layer-panel"><div className="panel-head"><div><b>Network layer inventory</b></div><span className="pill">{loading ? 'Loading' : `${layers.length} layers`}</span></div>
      <div className="layer-grid">{layers.map((layer, index) => <div className="layer-item" key={layer.id}><span className="layer-swatch" style={{ background: layer.color || CHART_COLORS[index % CHART_COLORS.length] }} /><span className="layer-name">{layer.label}</span><b>{loading ? '—' : counts[index].toLocaleString()}</b></div>)}</div>
    </section>
  </div>;
}
