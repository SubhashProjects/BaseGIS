export const UI = {
  brand: { name: 'PowerGIS', subtitle: '' },
  nav: {
    dashboard: 'Dashboard', gis: 'GIS Master Map', assets: 'Assets', approvals: 'Approvals', admin: 'Administration'
  },
  auth: {
    secureAccess: 'SECURE TEST ACCESS', officerProfile: 'Officer Profile', signIn: 'Sign In', selectOfficer: 'Select your designation and officer profile to continue.',
    username: 'Username', password: 'Password', signInButton: 'Sign in to PowerGIS', signingIn: 'Signing in…',
    invalid: 'Invalid username or password.', missing: 'Please enter your username and password.',
    loading: 'Loading users…', noUsers: 'No officers found matching',
    temporaryCredentialNote: 'Test access: username and password are the same.', workspace: 'Authorised workspace', assetCount: 'assets', passwordField: 'Password field'
  },
  dashboard: {
    eyebrow: 'POWERGIS / OVERVIEW', title: 'PowerGIS Dashboard', subtitle: 'Authorised electricity distribution intelligence',
    visibleAssets: 'Visible Assets', substations: 'Substations', transformers: 'Power Transformers', meters: 'Smart Meters',
    operational: 'Operational assets', inventory: 'GIS inventory', network: 'Distribution network', connected: 'Connected inventory',
    layerInventory: 'Visible layer inventory'
  },
  gis: {
    eyebrow: 'POWERGIS / GIS', title: 'GIS Master Map', authorised: 'Authorised GIS view', loggedIn: 'Logged-in user', hierarchy: 'My hierarchy', inventory: 'Visible inventory',
    loading: 'Loading authorised map data…', restricted: 'Only data within your authorised hierarchy is displayed.',
    status: 'Status', visibility: 'Visibility', jurisdiction: 'Jurisdiction', coordinates: 'Coordinates',
    shared: 'Shared boundary', private: 'Private', close: 'Close', baseMap: 'Base map', layers: 'GIS layers',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit authorised area', north: 'Reset north',
    mapHelp: 'Wheel: zoom · Drag: pan · Shift + drag / right-drag: rotate · N: north',
    navigationTitle: 'Map hierarchy navigation', navigationSubtitle: '', myScope: 'My scope', navigationAll: 'All authorised areas',
    zoomReadout: 'Zoom', rotation: 'Rotation'
  },
  assets: { eyebrow: 'POWERGIS / ASSETS', title: 'Asset Inventory', asset: 'Asset', type: 'Type', status: 'Status', jurisdiction: 'Jurisdiction', visibility: 'Visibility' },
  approvals: {
    eyebrow: 'POWERGIS / WORKFLOW', title: 'Approvals', pending: 'My pending work', workflow: 'Workflow', submission: 'Submission', asset: 'Asset', area: 'Area', stage: 'Stage', action: 'Action', review: 'Review',
    sequence: 'DRAFT → SUBMITTED → JE REVIEW → AE REVIEW → APPROVED → ACTIVE', unavailable: 'Approval data unavailable'
  },
  admin: { eyebrow: '', title: 'Administration', subtitle: '', users: 'Users', assets: 'GIS Assets', jurisdictions: 'Jurisdictions', security: 'Security', organisation: 'Organisation data', operations: 'Data operations', restricted: 'Access restricted.', securityValue: 'Session RPC', directoryNote: '', importAction: 'Import GIS data', exportAction: 'Export authorised data', backupAction: 'Backup / restore', directoryMetric: '', assetsMetric: '', jurisdictionMetric: '', securityMetric: '', data: { title: 'GIS Data Management', subtitle: '', importTitle: 'Import layers', importHelp: '', assetType: 'Default layer type', importButton: 'Choose GIS file', exportTitle: 'Export data', exportHelp: '', format: 'Export format', exportButton: 'Export now', backupTitle: 'Database backup', backupHelp: '', backupButton: 'Backup now', dailySchedule: '', history: 'Backup history', refresh: 'Refresh backup history', noBackups: 'No backup runs recorded yet.', operationsNote: '' } },
  hierarchy: { subdivision: 'Sub Division', division: 'Division', circle: 'Circle', department: 'Department', region: 'Region', je: 'JE Jurisdiction' },
  common: { loading: 'Loading…', error: 'Data unavailable', active: 'Active', pending: 'Pending', noData: 'No data available', allRegions: 'All Regions', database: 'Supabase / PostGIS' }
} as const;

export const ROLE_ORDER = ['SE', 'EE', 'AEE', 'AE', 'JE', 'GIS_ADMIN'] as const;
export const ROLE_LABELS: Record<string, string> = { SE: 'SE', EE: 'EE', AEE: 'AEE', AE: 'AE', JE: 'JE', GIS_ADMIN: 'GIS Admin', CONTRACTOR: 'Contractor' };
export const NAV_ICONS = { dashboard: 'LayoutDashboard', gis: 'Map', assets: 'Database', approvals: 'ClipboardCheck', admin: 'ShieldCheck' } as const;
