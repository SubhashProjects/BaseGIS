import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import type { PowerGISUser } from '../../services/powergisData';

export function ApprovalsPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, loading, error } = usePowerGISData(currentUser);
  const rows = assets.filter((a) => ['SUBMITTED', 'APPROVED'].includes(a.status)).slice(0, 20);
  const stage = (status: string) => (status === 'SUBMITTED' ? 'JE_REVIEW' : 'AE_REVIEW');

  if (error) {
    return (
      <div className="content">
        <div className="notice error-notice">
          <b>Approval data unavailable</b>
          <br />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="layout-grid">
        <div className="panel">
          <div className="panel-head">
            My pending work <span className="pill">{loading ? '…' : rows.length}</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Asset</th>
                <th>Area</th>
                <th>Stage</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.assetNo}</td>
                  <td>{a.jurisdictions.join(', ')}</td>
                  <td>
                    <span className="pill">{stage(a.status)}</span>
                  </td>
                  <td>
                    <button className="btn">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-head">Workflow</div>
          <div style={{ padding: 16 }}>
            <div className="notice">DRAFT → SUBMITTED → JE REVIEW → AE REVIEW → APPROVED → ACTIVE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
