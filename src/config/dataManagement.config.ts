export const DATA_IMPORT_FORMATS = [
  { extension: '.kml', label: 'KML', kind: 'kml' },
  { extension: '.kmz', label: 'KMZ', kind: 'kmz' },
  { extension: '.geojson', label: 'GeoJSON', kind: 'geojson' },
  { extension: '.json', label: 'GeoJSON JSON', kind: 'geojson' },
  { extension: '.csv', label: 'CSV', kind: 'csv' },
  { extension: '.xlsx', label: 'Excel XLSX', kind: 'xlsx' },
  { extension: '.xls', label: 'Excel XLS', kind: 'xlsx' },
  { extension: '.gpkg', label: 'GeoPackage', kind: 'gpkg' },
] as const;

export const DATA_EXPORT_FORMATS = [
  { extension: 'geojson', label: 'GeoJSON' },
  { extension: 'csv', label: 'CSV' },
  { extension: 'json', label: 'PowerGIS JSON backup' },
] as const;

export const BACKUP_CONFIG = {
  retentionDays: 30,
  schedule: 'Daily',
  backupBucket: 'powergis-backups',
  tables: ['organization_users', 'gis_jurisdictions', 'gis_assets'],
} as const;
