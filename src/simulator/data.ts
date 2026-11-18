import usersRaw from '../../data/organisation-seed.json';
import type { SimulatorAsset, SimulatorUser } from './types';

const regionFor = (name: string) => {
  const n = name.toLowerCase();
  const karaikal = ['trpattinam', 'townkkl', 'neravy', 'kottucherry', 'townnorthkkl', 'thirunallar', 'nedungadu', 'ambakarathur'];
  if (karaikal.some(x => n.includes(x))) return 'KARAIKAL';
  if (n.includes('mahe')) return 'MAHE';
  if (n.includes('yanam')) return 'YANAM';
  return 'PONDICHERRY';
};

const jeUsers: SimulatorUser[] = (usersRaw as any[]).map((r, i) => ({
  id: `sim-user-${String(i + 1).padStart(3, '0')}`,
  username: `sim.${String(r['JE / User Name']).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}`,
  displayName: `[SIM] ${r['JE / User Name']}`, role: 'JE', subdivision: r['Sub Division'] ?? null, division: r['Division'] ?? null, circle: r['Circle'] ?? null, department: r['Dept'] ?? null, jurisdictions: [regionFor(String(r['JE / User Name']))], simulatorOnly: true,
}));
const unique = (key: string) => Array.from(new Set((usersRaw as any[]).map(r => r[key]).filter(Boolean).map(String)));
const hierarchyUsers: SimulatorUser[] = [
  ...unique('Sub Division').map((name, i) => ({ id: `sim-ae-${i + 1}`, username: `sim.ae.${i + 1}`, displayName: `[SIM] ${name}`, role: 'AE' as const, subdivision: name, division: null, circle: null, department: null, jurisdictions: [regionFor(name)], simulatorOnly: true as const })),
  ...unique('Division').map((name, i) => ({ id: `sim-ee-${i + 1}`, username: `sim.ee.${i + 1}`, displayName: `[SIM] ${name}`, role: 'EE' as const, subdivision: null, division: name, circle: null, department: null, jurisdictions: [regionFor(name)], simulatorOnly: true as const })),
  ...unique('Circle').map((name, i) => ({ id: `sim-se-${i + 1}`, username: `sim.se.${i + 1}`, displayName: `[SIM] ${name}`, role: 'SE' as const, subdivision: null, division: null, circle: name, department: null, jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'], simulatorOnly: true as const })),
  ...unique('Dept').map((name, i) => ({ id: `sim-hod-${i + 1}`, username: `sim.hod.${i + 1}`, displayName: `[SIM] ${name}`, role: 'SE' as const, subdivision: null, division: null, circle: null, department: name, jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'], simulatorOnly: true as const })),
];
const contractorUsers: SimulatorUser[] = unique('Sub Division').map((name, i) => ({ id: `sim-contractor-${i + 1}`, username: `sim.contractor.${i + 1}`, displayName: `[SIM] Contractor - ${name}`, role: 'CONTRACTOR' as const, subdivision: name, division: null, circle: null, department: null, jurisdictions: [regionFor(name)], simulatorOnly: true as const }));
export const simulatorUsers: SimulatorUser[] = [
  { id: 'sim-admin-001', username: 'sim.gis.admin', displayName: '[SIM] GIS Admin', role: 'GIS_ADMIN', subdivision: null, division: null, circle: null, department: 'SE - 1 HOD', jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'], simulatorOnly: true },
  ...hierarchyUsers, ...jeUsers, ...contractorUsers,
];

export const simulatorJurisdictions = [
  { id: 'PONDICHERRY', label: 'Pondicherry', region: 'Pondicherry', color: '#2563eb' },
  { id: 'KARAIKAL', label: 'Karaikal', region: 'Karaikal', color: '#059669' },
  { id: 'MAHE', label: 'Mahe', region: 'Mahe', color: '#d97706' },
  { id: 'YANAM', label: 'Yanam', region: 'Yanam', color: '#7c3aed' },
] as const;

const centers: Record<string, [number, number]> = {
  PONDICHERRY: [11.9139, 79.8145],
  KARAIKAL: [10.9254, 79.8380],
  MAHE: [11.7000, 75.5300],
  YANAM: [16.7333, 82.2167],
};

const types = ['SUBSTATION', 'EHV_LINE', 'HV_LINE', 'DT', 'LT_LINE', 'POLE', 'SMART_METER'];
const assets: SimulatorAsset[] = [];

Object.entries(centers).forEach(([region, [lat, lng]], regionIndex) => {
  for (let i = 0; i < 10; i += 1) {
    const type = types[(i + regionIndex) % types.length];
    assets.push({
      id: `sim-asset-${regionIndex + 1}-${i + 1}`,
      assetNo: `[SIM]-${type}-${String(regionIndex * 100 + i + 1).padStart(4, '0')}`,
      assetType: type,
      status: i % 4 === 0 ? 'SUBMITTED' : i % 3 === 0 ? 'APPROVED' : 'ACTIVE',
      jurisdictionIds: [region],
      coordinates: [lat + ((i % 5) - 2) * 0.018, lng + ((i % 4) - 1.5) * 0.022],
    });
  }
});

assets.push({
  id: 'sim-shared-001',
  assetNo: '[SIM]-DT-SHARED-001',
  assetType: 'DT',
  status: 'ACTIVE',
  jurisdictionIds: ['PONDICHERRY', 'KARAIKAL'],
  coordinates: [11.43, 79.83],
  sharedBoundary: true,
});

export const simulatorAssets = assets;
export const simulatorCenters = centers;
