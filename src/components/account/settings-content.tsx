'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArchivedJobs } from './archived-jobs';
import { DependentsSettings } from './dependents-settings';
import { useProfile } from '@/hooks/use-profile';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';

export function SettingsContent() {
  const { profile, isLoading, error, update } = useProfile();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const [name, setName] = useState<string | null>(null);
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  async function selectBackup(file?: File) {
    setBackup(null); setFileName(''); setConfirmation(''); setTransferError('');
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a backup smaller than 50 MB.');
      const json: unknown = JSON.parse(await file.text());
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('The backup must be a JSON object.');
      setBackup(json); setFileName(file.name);
    } catch (err) { setTransferError(err instanceof Error ? err.message : 'Cannot read this backup.'); }
  }

  async function transfer(reset: boolean) {
    setBusy(true); setTransferError('');
    try {
      const response = await fetch(reset ? '/api/account/delete' : '/api/backup', {
        method: reset ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { confirmation: resetConfirmation } : { backup, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Data transfer failed.');
      queryClient.clear();
      setName(null); setBackup(null); setFileName(''); setConfirmation(''); setResetConfirmation('');
      await queryClient.invalidateQueries();
      toast.success(reset ? 'Local data reset. A safety backup was saved.' : 'Backup restored. Previous local data was backed up.');
      window.location.reload();
    } catch (err) { setTransferError(err instanceof Error ? err.message : 'Data transfer failed.'); }
    finally { setBusy(false); }
  }

  if (isLoading) return <div className="p-12"><LoadingSpinner /></div>;
  if (error || !profile) return <div className="p-8"><ErrorState onRetry={() => window.location.reload()} /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Local profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" maxLength={100} value={name ?? profile.display_name ?? ''} onChange={e => setName(e.target.value)} />
          </div>
          <Button disabled={update.isPending} onClick={async () => {
            try { await update.mutateAsync({ display_name: (name ?? profile.display_name ?? '').trim() }); toast.success('Profile saved'); }
            catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); }
          }}>Save profile</Button>
          <div className="space-y-2">
            <Label htmlFor="theme">Appearance</Label>
            <select id="theme" className="block rounded border px-3 py-2 bg-background" value={profile.theme_preference ?? 'system'} onChange={async e => {
              const theme = e.target.value as 'system' | 'light' | 'dark';
              try { await update.mutateAsync({ theme_preference: theme }); setTheme(theme); }
              catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save theme'); }
            }}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground">Edit year-specific filing status, dependents, deductions, and quarterly payments on the dashboard.</p>
        </CardContent>
      </Card>
      <DependentsSettings />
      <ArchivedJobs />
      <Card>
        <CardHeader><CardTitle>Backup and restore</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Backups include every local table: jobs and history, W-2s, dependents, tax profiles, benefits, scenarios, calculations, checklists, scanner history, and settings.</p>
          <a href="/api/backup" download className="inline-block rounded border px-4 py-2 text-sm font-medium">Download complete backup</a>
          <div className="space-y-2">
            <Label htmlFor="backup-file">Restore backup or import existing account data (JSON)</Label>
            <Input id="backup-file" type="file" accept=".json,application/json" disabled={busy} onChange={e => void selectBackup(e.target.files?.[0])} />
            <p className="text-xs text-muted-foreground">The app validates the format, records, and relationships before replacing anything. The original source file is unchanged.</p>
          </div>
          {backup !== null && <div className="space-y-3 rounded border border-destructive/30 p-4">
            <p className="text-sm">Restore <strong>{fileName}</strong>? This replaces all current local data. A safety backup is saved first.</p>
            <Label htmlFor="restore-confirm">Type RESTORE to confirm replacement</Label>
            <Input id="restore-confirm" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" />
            <Button variant="destructive" disabled={confirmation !== 'RESTORE' || busy} onClick={() => void transfer(false)}>{busy ? 'Restoring…' : 'Restore selected file'}</Button>
          </div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Reset local data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">Remove all current local records and start with a fresh profile. A safety backup is saved first.</p>
          <Label htmlFor="reset-confirm">Type DELETE to confirm reset</Label>
          <Input id="reset-confirm" value={resetConfirmation} onChange={e => setResetConfirmation(e.target.value)} autoComplete="off" />
          <Button variant="destructive" disabled={resetConfirmation !== 'DELETE' || busy} onClick={() => void transfer(true)}>Reset local data</Button>
        </CardContent>
      </Card>
      {transferError && <p role="alert" className="rounded border border-destructive p-4 text-sm text-destructive">{transferError}</p>}
      <p className="text-sm text-muted-foreground">AI scanning is disabled. Tax tools and manual prospective-job scenarios work offline. Reminders appear when you open the dashboard; export calendar reminders to receive them while the app is closed.</p>
    </div>
  );
}
