import { useMemo, useState } from 'react';
import { ChevronDown, MapPinned, LocateFixed } from '../../components/icons';
import { UI } from '../../config/ui.config';
import type { PowerGISBoundary, PowerGISUser } from '../../services/powergisData';

export type MapNavigationTarget = {
  level: 'region' | 'circle' | 'division' | 'subdivision' | 'je';
  value: string;
  boundaryIds: string[];
  key: string;
};

type Props = {
  currentUser: PowerGISUser;
  boundaries: PowerGISBoundary[];
  onNavigate: (target: MapNavigationTarget) => void;
  onReset: () => void;
};

const LEVELS = [
  { key: 'region', label: UI.hierarchy.region },
  { key: 'circle', label: UI.hierarchy.circle },
  { key: 'division', label: UI.hierarchy.division },
  { key: 'subdivision', label: UI.hierarchy.subdivision },
  { key: 'je', label: UI.hierarchy.je },
] as const;

type LevelKey = typeof LEVELS[number]['key'];

export function MapHierarchyNavigator({ currentUser, boundaries, onNavigate, onReset }: Props) {
  const initial = useMemo(() => ({
    region: currentUser.region || '',
    circle: currentUser.circle || '',
    division: currentUser.division || '',
    subdivision: currentUser.subdivision || '',
    je: currentUser.role === 'JE' ? (boundaries.find(b => b.id === currentUser.jurisdictions[0])?.name || '') : '',
  }), [currentUser, boundaries]);
  const [selection, setSelection] = useState<Record<LevelKey, string>>(initial);

  const optionsFor = (level: LevelKey) => {
    const idx = LEVELS.findIndex(l => l.key === level);
    const parents = LEVELS.slice(0, idx).map(l => l.key);
    const filtered = boundaries.filter(b => parents.every(parent => !selection[parent] || String(b[parent === 'je' ? 'name' : parent] ?? '') === selection[parent]));
    const values = Array.from(new Set(filtered.map(b => String(level === 'je' ? b.name : b[level] ?? '')).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  };

  const apply = (level: LevelKey, value: string) => {
    const next = { ...selection, [level]: value } as Record<LevelKey, string>;
    const idx = LEVELS.findIndex(l => l.key === level);
    LEVELS.slice(idx + 1).forEach(child => { next[child.key] = ''; });
    setSelection(next);
    if (!value) return;
    const filtered = boundaries.filter(b => LEVELS.slice(0, idx + 1).every(l => {
      const selected = next[l.key];
      return !selected || String(l.key === 'je' ? b.name : b[l.key] ?? '') === selected;
    }));
    onNavigate({
      level,
      value,
      boundaryIds: filtered.map(b => b.id),
      key: `${level}:${value}`,
    });
  };

  return (
    <div className="map-hierarchy-nav panel">
      <div className="map-hierarchy-nav-head">
        <div className="map-nav-title"><span className="map-nav-icon"><MapPinned size={15}/></span><div><b>{UI.gis.navigationTitle}</b><small>{UI.gis.navigationSubtitle}</small></div></div>
        <button className="map-nav-reset" type="button" onClick={() => { setSelection(initial); onReset(); }} title={UI.gis.myScope}><LocateFixed size={14}/><span>{UI.gis.myScope}</span></button>
      </div>
      <div className="map-hierarchy-selects">
        {LEVELS.map(level => {
          const options = optionsFor(level.key);
          const disabled = level.key !== 'region' && LEVELS.slice(0, LEVELS.findIndex(l => l.key === level.key)).some(parent => !selection[parent.key]);
          return <label key={level.key} className="map-hierarchy-field"><span>{level.label}</span><div className="map-select-wrap"><select value={selection[level.key]} disabled={disabled || options.length === 0} onChange={e => apply(level.key, e.target.value)}><option value="">{UI.gis.navigationAll}</option>{options.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14}/></div></label>;
        })}
      </div>
    </div>
  );
}
