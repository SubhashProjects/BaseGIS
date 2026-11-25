import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { useGisLayers } from '../../services/layerService';
import type { PowerGISUser } from '../../services/powergisData';

export function Dashboard({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, loading, error } = usePowerGISData(currentUser);
  const { layers } = useGisLayers();
  const counts = (t: string) => assets.filter((a) => a.assetType === t).length;
  const metrics = [
    ['Visible Assets', String(assets.length), 'Operational assets'],
    ['Substations', String(counts('SUBSTATION')), 'GIS inventory'],
    ['Transformers', String(counts('DT')), 'Distribution network'],
    ['Smart Meters', String(counts('SMART_METER')), 'Connected inventory'],
  ];

  if (error) {
    return (
      <div className="content">
        <div className="notice error-notice">
          <b>Dashboard data unavailable</b>
          <br />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="cards">
        {metrics.map((m) => (
          <div className="card" key={m[0]}>
            <div className="metric-label">{m[0]}</div>
            <div className="metric">{loading ? '—' : m[1]}</div>
            <div className="muted">{m[2]}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <section className="panel">
          <div className="panel-head">Visible layer inventory</div>
          <div className="inventory">
            {layers.map((l) => (
              <div key={l.id}>
                <span>
                  <i className="layer-dot" style={{ background: l.color }} />
                  {l.label}
                </span>
                <b>{counts(l.id)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
