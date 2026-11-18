import { UI } from '../../config/ui.config';
import { useAdminViewModel } from '../../viewmodels/useAdminViewModel';
import { DataManagementPanel } from './DataManagementPanel';
import type { PowerGISUser } from '../../services/powergisData';

export function AdminPage({ currentUser }: { currentUser: PowerGISUser }) {
  const vm = useAdminViewModel(currentUser);
  if (currentUser.role !== 'GIS_ADMIN') {
    return (
      <div className="content">
        <div className="notice">
          <b>{UI.admin.restricted}</b>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-title">
        <div>
          <span className="eyebrow">{UI.admin.eyebrow}</span>
          <h1>{UI.admin.title}</h1>
          <p>{UI.admin.subtitle}</p>
        </div>
      </div>
      <div className="cards">
        <div className="card accent-0">
          <div className="metric-label">{UI.admin.users}</div>
          <div className="metric">{vm.users.length || '—'}</div>
          <div className="muted">{UI.admin.directoryMetric}</div>
        </div>
        <div className="card accent-1">
          <div className="metric-label">{UI.admin.assets}</div>
          <div className="metric">{vm.loading ? '—' : vm.assets.length}</div>
          <div className="muted">{UI.admin.assetsMetric}</div>
        </div>
        <div className="card accent-2">
          <div className="metric-label">{UI.admin.jurisdictions}</div>
          <div className="metric">{vm.loading ? '—' : vm.boundaries.length}</div>
          <div className="muted">{UI.admin.jurisdictionMetric}</div>
        </div>
        <div className="card accent-3">
          <div className="metric-label">{UI.admin.security}</div>
          <div className="metric">{UI.admin.securityValue}</div>
          <div className="muted">{UI.admin.securityMetric}</div>
        </div>
      </div>
      <DataManagementPanel currentUser={currentUser} />
      <div className="layout-grid">
        <section className="panel">
          <div className="panel-head">{UI.admin.organisation}</div>
          <div className="panel-body">
            <div className="notice">{UI.admin.directoryNote}</div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">{UI.admin.operations}</div>
          <div className="panel-body">
            <div className="notice">{UI.admin.data.operationsNote}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
