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
          <h1>{UI.admin.title}</h1>
        </div>
      </div>
      <div className="cards admin-cards">
        <div className="card accent-0">
          <div className="metric-label">{UI.admin.users}</div>
          <div className="metric">{vm.users.length || '—'}</div>
        </div>
        <div className="card accent-1">
          <div className="metric-label">{UI.admin.assets}</div>
          <div className="metric">{vm.loading ? '—' : vm.assets.length}</div>
        </div>
        <div className="card accent-2">
          <div className="metric-label">{UI.admin.jurisdictions}</div>
          <div className="metric">{vm.loading ? '—' : vm.boundaries.length}</div>
        </div>
      </div>
      <DataManagementPanel currentUser={currentUser} />
    </div>
  );
}
