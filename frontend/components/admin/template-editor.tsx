'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui/primitives';
import { useBusy } from '@/components/admin/kit';
import { api } from '@/lib/api';

export interface Tpl { id: string; key: string; name: string; subject: string; body: string; enabled: boolean; variables: string[] }
export interface Preview { subject: string; html: string; unknown: string[] }

/** Template editor with live preview; shared with Founder Settings. */
export function TemplateEditor({ tpl, open, onClose, onSaved }: { tpl?: Tpl; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ key: tpl?.key ?? '', name: tpl?.name ?? '', subject: tpl?.subject ?? '', body: tpl?.body ?? '' });
  const [pv, setPv] = useState<Preview | null>(null);
  const [to, setTo] = useState('');
  const { busy, run } = useBusy();
  useEffect(() => {
    if (!tpl || !open) return;
    const t = setTimeout(() => { api.post<Preview>(`/admin/email/templates/${tpl.id}/preview`, { subject: f.subject, body: f.body }).then((r) => setPv(r.data)).catch(() => undefined); }, 400);
    return () => clearTimeout(t);
  }, [tpl, open, f.subject, f.body]);
  const save = () => run('save', async () => { tpl ? await api.patch(`/admin/email/templates/${tpl.id}`, { name: f.name, subject: f.subject, body: f.body }) : await api.post('/admin/email/templates', f); onSaved(); onClose(); }, 'Template saved');
  return (
    <Modal open={open} onClose={onClose} side width="max-w-3xl" title={tpl ? `Edit: ${tpl.name}` : 'New template'} footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={!!busy || !f.name || !f.subject || !f.body || (!tpl && !/^[a-z0-9_]{3,60}$/.test(f.key))} onClick={save}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></>}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          {!tpl && <Field label="Key (lowercase, digits, underscores)"><input className="input" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>}
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Subject"><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Body (HTML). Use {{variable}} placeholders"><textarea className="input font-mono text-xs" rows={12} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          {tpl && <div className="flex gap-2"><input className="input" type="email" placeholder="Send a test to…" value={to} onChange={(e) => setTo(e.target.value)} /><button className="btn-secondary whitespace-nowrap" disabled={!to || !!busy} onClick={() => run('send', () => api.post(`/admin/email/templates/${tpl.id}/test-send`, { to }), 'Test email sent')}>{busy === 'send' && <Loader2 className="h-4 w-4 animate-spin" />}Send test</button></div>}
        </div>
        <div>
          <p className="label">Preview (sample data)</p>
          {!tpl ? <p className="text-sm text-ink-soft">Save the template to see a preview.</p> : !pv ? <p className="text-sm text-ink-soft">Rendering…</p> : <>
            <p className="text-sm font-medium mb-2">{pv.subject}</p>
            <iframe title="Email preview" sandbox="" srcDoc={`<body style="font-family:sans-serif;font-size:14px;color:#242124">${pv.html}</body>`} className="w-full h-72 rounded-lg border border-line bg-white" />
            {pv.unknown.length > 0 && <p className="text-xs text-warning mt-2">Unknown variables: {pv.unknown.map((u) => `{{${u}}}`).join(', ')}</p>}
          </>}
        </div>
      </div>
    </Modal>
  );
}

