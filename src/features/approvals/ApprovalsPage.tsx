import { useMemo, useState } from 'react';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { reviewAssetSubmission } from '../../services/powergisData';
import type { PowerGISUser } from '../../services/powergisData';

export function ApprovalsPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, loading, error, refresh } = usePowerGISData(currentUser);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const rows = useMemo(
    () => assets.filter((a) => ['SUBMITTED', 'JE_REVIEW', 'AE_REVIEW'].includes(a.status)),
    [assets],
  );

  const canReview = (status: string) => {
    if (currentUser.role === 'GIS_ADMIN') return true;
    if (status === 'SUBMITTED') return currentUser.role === 'JE';
    return ['AE', 'AEE', 'EE', 'SE'].includes(currentUser.role);
  };

  const decide = async (assetId: string, version: number | undefined, decision: 'approve' | 'reject') => {
    if (!version) {
      setActionError('This record has no concurrency version. Refresh the inventory and apply migration 009.');
      return;
    }
    const comment = window.prompt(decision === 'reject' ? 'Reason for rejection (required):' : 'Review comment (optional):');
    if (comment === null) return;
    if (decision === 'reject' && !comment.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }
    setBusyId(assetId);
    setActionError('');
    try {
      await reviewAssetSubmission(assetId, version, decision, comment.trim());
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The review action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return <div className="content"><div className="notice error-notice"><b>Approval data unavailable</b><br />{error}</div></div>;
  }

  return (
    <div className="content">
      <div className="notice" role="status" style={{ marginBottom: 16 }}>
        Review decisions are validated by the database against the active session, assigned role, jurisdiction and record version. If another user changes a submission first, reload it before deciding.
      </div>
      {actionError && <div className="notice error-notice" role="alert" style={{ marginBottom: 16 }}>{actionError}</div>}
      <div className="layout-grid">
        <div className="panel">
          <div className="panel-head">
            <span>Pending review</span><span className="pill">{loading ? '…' : rows.length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Submission</th><th>Asset</th><th>Area</th><th>Stage</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.id}</td>
                    <td><b>{asset.assetNo}</b></td>
                    <td>{asset.jurisdictions.join(', ') || '—'}</td>
                    <td><span className="pill">{asset.status}</span></td>
                    <td>
                      {canReview(asset.status) ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn" type="button" disabled={busyId === asset.id} onClick={() => void decide(asset.id, asset.version, 'approve')}>
                            {busyId === asset.id ? 'Saving…' : 'Approve'}
                          </button>
                          <button className="btn" type="button" disabled={busyId === asset.id} onClick={() => void decide(asset.id, asset.version, 'reject')}>Reject</button>
                        </div>
                      ) : <span className="muted">Awaiting authorised reviewer</span>}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && <tr><td colSpan={5} className="muted">No submissions are waiting for review.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">Workflow</div>
          <div style={{ padding: 16 }}>
            <div className="notice">Submitted → JE review → AE review → Approved</div>
            <p className="muted" style={{ marginTop: 12 }}>Rejections require a reason. Each accepted transition increments the record version and writes an audit event. Final role and jurisdiction checks always run on the server.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
