import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { ASSET_COLORS, ASSET_LABELS } from '../../config/constants';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import type { PowerGISUser } from '../../services/powergisData';

type SortField = 'assetNo' | 'assetType' | 'status' | 'jurisdiction' | 'visibility';
type SortDirection = 'asc' | 'desc';

export function AssetsPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets, loading } = usePowerGISData(currentUser);
  const [sortField, setSortField] = useState<SortField>('assetNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedAssets = useMemo(() => {
    const list = [...assets];
    list.sort((a, b) => {
      let valA = '';
      let valB = '';

      switch (sortField) {
        case 'assetNo':
          valA = a.assetNo || '';
          valB = b.assetNo || '';
          break;
        case 'assetType':
          valA = ASSET_LABELS[a.assetType] ?? a.assetType ?? '';
          valB = ASSET_LABELS[b.assetType] ?? b.assetType ?? '';
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        case 'jurisdiction':
          valA = (a.jurisdictions || []).join(', ');
          valB = (b.jurisdictions || []).join(', ');
          break;
        case 'visibility':
          valA = a.shared ? 'Shared boundary' : 'Private';
          valB = b.shared ? 'Shared boundary' : 'Private';
          break;
      }

      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [assets, sortField, sortDirection]);

  const renderSortHeader = (label: string, field: SortField) => {
    const isActive = sortField === field;
    return (
      <th
        key={field}
        onClick={() => handleSort(field)}
        className={`sortable-th ${isActive ? 'active' : ''}`}
        title={`Sort by ${label} (${isActive && sortDirection === 'asc' ? 'Descending' : 'Ascending'})`}
      >
        <div className="th-content">
          <span>{label}</span>
          <span className="sort-icon">
            {isActive ? (
              sortDirection === 'asc' ? (
                <ArrowUp size={13} className="sort-active" />
              ) : (
                <ArrowDown size={13} className="sort-active" />
              )
            ) : (
              <ArrowUpDown size={12} className="sort-idle" />
            )}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="content">
      <div className="panel">
        <div className="panel-head">
          <span>Asset Inventory</span>
          <span className="pill">{loading ? 'Loading…' : `${assets.length} assets`}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              {renderSortHeader('Asset', 'assetNo')}
              {renderSortHeader('Type', 'assetType')}
              {renderSortHeader('Status', 'status')}
              {renderSortHeader('Jurisdiction', 'jurisdiction')}
              {renderSortHeader('Visibility', 'visibility')}
            </tr>
          </thead>
          <tbody>
            {sortedAssets.map((a) => (
              <tr key={a.id}>
                <td>
                  <b>{a.assetNo}</b>
                </td>
                <td>
                  <span className="type-chip">
                    <i style={{ background: ASSET_COLORS[a.assetType] }} />
                    {ASSET_LABELS[a.assetType] ?? a.assetType}
                  </span>
                </td>
                <td>
                  <span className={'status ' + (a.status === 'ACTIVE' ? 'active' : 'pending')}>{a.status}</span>
                </td>
                <td>{a.jurisdictions.length > 0 ? a.jurisdictions.join(', ') : '—'}</td>
                <td>{a.shared ? 'Shared boundary' : 'Private'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
