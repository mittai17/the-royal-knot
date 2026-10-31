'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { Card, ErrorState, Field, Skeleton } from '@/components/ui/primitives';
import { api, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/toast';
import { useApi } from '@/hooks/use-api';

/** Loading / error boundary around a `useApi` result. Renders `children` once data has arrived (and keeps showing it during silent reloads). */
export function Async<T>({ q, children, rows = 4 }: { q: { data: T | null; loading: boolean; error: string | null; reload: () => void }; children: (d: T) => ReactNode; rows?: number }) {
  if (q.error && !q.data) return <Card><ErrorState message={q.error} onRetry={q.reload} /></Card>;
  if (!q.data) return <div className="space-y-4" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  return <>{children(q.data)}</>;
}

/** Plain link to an authenticated download (same-origin cookie session). */
export function FileLink({ path, label = 'Download', preview = false, className = 'btn-secondary btn-sm' }: { path: string; label?: string; preview?: boolean; className?: string }) {
  return <a className={className} href={apiUrl(path)} target={preview ? '_blank' : undefined} rel="noreferrer" download={preview ? undefined : ''}><Download className="h-3.5 w-3.5" />{label}</a>;
}

/** QR for a UPI deep link, drawn locally (no external service). */
export function QrSvg({ value, size = 220 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
  }, [value]);
  return <div role="img" aria-label="UPI payment QR code" className="mx-auto rounded-xl border border-line bg-white p-2" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const PREF_ROWS: [string, string, string][] = [
  ['email', 'Email notifications', 'Receive updates by email'], ['sms', 'SMS notifications', 'Text messages for urgent items'], ['paymentReminders', 'Payment reminders', 'Due and overdue payment alerts'],
  ['scheduleChanges', 'Schedule changes', 'When timings or venues change'], ['announcements', 'Announcements', 'Updates from your planner'], ['messages', 'Chat messages', 'New messages in the portal'],
];

interface SettingsData { profile: { name: string; email: string; phone: string | null; role: string; lastLoginAt: string | null }; notifications: Record<string, boolean> }

/** Profile, notification preferences and password change; shared by both portals (`base` = `/portal/client` or `/portal/vendor`). */
export function SettingsPanel({ base }: { base: string }) {
  const q = useApi<SettingsData>(`${base}/settings`);
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  useEffect(() => { if (q.data) { setName(q.data.profile.name); setPhone(q.data.profile.phone ?? ''); } }, [q.data]);

  const saveProfile = async () => {
    setBusy('profile');
    try { await api.patch(`${base}/settings/profile`, { name, phone }); notify.ok('Profile updated'); await refresh(); q.reload(); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };
  const toggle = async (k: string, v: boolean) => {
    if (q.data) q.setData({ ...q.data, notifications: { ...q.data.notifications, [k]: v } });
    try { await api.patch(`${base}/settings/notifications`, { [k]: v }); } catch (e) { notify.err(e); q.reload(); }
  };
  const changePw = async () => {
    if (pw.next !== pw.confirm) { notify.err(new Error('New passwords do not match')); return; }
    setBusy('pw');
    try { await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }); notify.ok('Password changed'); setPw({ current: '', next: '', confirm: '' }); } catch (e) { notify.err(e); } finally { setBusy(''); }
  };

  return (
    <Async q={q} rows={3}>
      {(d) => (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Profile">
            <div className="space-y-4">
              <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
              <Field label="Email (sign-in)"><input className="input" value={d.profile.email} disabled /></Field>
              <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></Field>
              <button className="btn-primary" disabled={busy === 'profile' || !name.trim()} onClick={saveProfile}>{busy === 'profile' && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button>
            </div>
          </Card>
          <Card title="Notification preferences">
            <ul className="divide-y divide-line">
              {PREF_ROWS.map(([k, l, h]) => (
                <li key={k} className="flex items-center justify-between gap-4 py-3">
                  <div><p className="text-sm font-medium">{l}</p><p className="text-xs text-ink-soft">{h}</p></div>
                  <input type="checkbox" role="switch" aria-label={l} className="h-5 w-5 accent-[#401827]" checked={!!d.notifications[k]} onChange={(e) => toggle(k, e.target.checked)} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Change password" className="lg:col-span-2">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
              <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
              <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-ink-soft mt-2">At least 10 characters with upper and lower case letters and a digit.</p>
            <button className="btn-primary mt-3" disabled={busy === 'pw' || !pw.current || !pw.next} onClick={changePw}>{busy === 'pw' && <Loader2 className="h-4 w-4 animate-spin" />}Change password</button>
          </Card>
        </div>
      )}
    </Async>
  );
}
