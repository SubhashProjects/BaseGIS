import { useCallback, useEffect, useState } from 'react';
import { createDatabaseBackup, downloadBlob, downloadDatabaseBackup, exportVisibleAssets, importAssets, listBackupRuns, parseImportFile, restoreDatabaseBackup } from '../services/dataManagementService';
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
      const features = await parseImportFile(file, defaultType);
      if (!features.length) throw new Error('No GIS features could be read from the selected file.');
      const result = await importAssets(features);
      if (result.errors.length) {
        setError(`Import partially completed: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors.length} errors. First error: ${result.errors[0]}`);
      } else {
        setMessage(`Server import completed: ${result.inserted} inserted; ${result.skipped} skipped.`);
      }
      return result;
    } catch (e: any) { setError(e?.message ?? 'Import failed.'); throw e; }
    finally { setBusy(false); }
  }, []);

  const exportData = useCallback(async (format: 'geojson'|'csv'|'json') => {
    setBusy(true); setMessage(''); setError('');
    try { const blob = await exportVisibleAssets(format); downloadBlob(blob, `powergis-export-${new Date().toISOString().slice(0,10)}.${format === 'geojson' ? 'geojson' : format}`); setMessage('Export completed.'); }
    catch (e:any) { setError(e?.message ?? 'Export failed.'); }
    finally { setBusy(false); }
  }, []);

  const backupNow = useCallback(async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const backup = await createDatabaseBackup();
      setMessage(`Backup queued (${backup.backup_id}). It will become downloadable after the backup worker completes and verifies storage.`);
      await refreshBackups();
    } catch (e:any) { setError(e?.message ?? 'Backup request failed.'); }
    finally { setBusy(false); }
  }, [refreshBackups]);

  const downloadBackup = useCallback(async (backupId: string) => {
    setBusy(true); setMessage(''); setError('');
    try { await downloadDatabaseBackup(backupId); setMessage(`Backup ${backupId} downloaded.`); }
    catch (e:any) { setError(e?.message ?? 'Backup download failed.'); }
    finally { setBusy(false); }
  }, []);

  const restoreBackup = useCallback(async (backupId: string) => {
    setBusy(true); setMessage(''); setError('');
    try {
      const counts = await restoreDatabaseBackup(backupId);
      setMessage(`Restore completed: ${counts.users_restored ?? 0} users, ${counts.jurisdictions_restored ?? 0} jurisdictions, ${counts.assets_restored ?? 0} assets merged. Existing credentials were preserved; no current records were deleted.`);
      await refreshBackups();
    } catch (e:any) { setError(e?.message ?? 'Backup restore failed.'); }
    finally { setBusy(false); }
  }, [refreshBackups]);

  return { busy, message, error, backups, importFile, exportData, backupNow, downloadBackup, restoreBackup, refreshBackups };
}
