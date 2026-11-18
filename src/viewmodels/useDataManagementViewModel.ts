import { useCallback, useEffect, useState } from 'react';
import { createDatabaseBackup, downloadBlob, exportVisibleAssets, importAssets, importSourceFile, listBackupRuns, parseImportFile } from '../services/dataManagementService';
import type { PowerGISUser } from '../services/powergisData';

export function useDataManagementViewModel(user: PowerGISUser) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backups, setBackups] = useState<any[]>([]);

  const refreshBackups = useCallback(async () => {
    if (user.role !== 'GIS_ADMIN') return;
    try { setBackups(await listBackupRuns()); } catch { setBackups([]); }
  }, [user.role]);

  useEffect(() => { void refreshBackups(); }, [refreshBackups]);

  const importFile = useCallback(async (file: File, defaultType: string) => {
    setBusy(true); setMessage(''); setError('');
    try {
      const extension = file.name.toLowerCase();
      const result = (extension.endsWith('.xlsx') || extension.endsWith('.xls') || extension.endsWith('.gpkg'))
        ? await importSourceFile(file, defaultType)
        : await (async () => { const features = await parseImportFile(file, defaultType); if (!features.length) throw new Error('No GIS features could be read from the selected file.'); return importAssets(features); })();
      setMessage(`Imported ${result.inserted} feature(s); skipped ${result.skipped}.`);
      await refreshBackups();
      return result;
    } catch (e: any) { setError(e?.message ?? 'Import failed.'); throw e; }
    finally { setBusy(false); }
  }, [refreshBackups]);

  const exportData = useCallback(async (format: 'geojson'|'csv'|'json') => {
    setBusy(true); setMessage(''); setError('');
    try { const blob = await exportVisibleAssets(format); downloadBlob(blob, `powergis-export-${new Date().toISOString().slice(0,10)}.${format === 'geojson' ? 'geojson' : format}`); setMessage('Export completed.'); }
    catch (e:any) { setError(e?.message ?? 'Export failed.'); }
    finally { setBusy(false); }
  }, []);

  const backupNow = useCallback(async () => {
    setBusy(true); setMessage(''); setError('');
    try { const backup = await createDatabaseBackup(); const blob = await exportVisibleAssets('json'); downloadBlob(blob, `powergis-backup-${new Date().toISOString().slice(0,10)}.json`); setMessage(`Backup created: ${backup?.backup_id ?? 'completed'}. A local backup copy was downloaded.`); await refreshBackups(); }
    catch (e:any) { setError(e?.message ?? 'Backup failed.'); }
    finally { setBusy(false); }
  }, [refreshBackups]);

  return { busy, message, error, backups, importFile, exportData, backupNow, refreshBackups };
}
