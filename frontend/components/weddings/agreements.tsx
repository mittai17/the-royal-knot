'use client';
import { useState } from 'react';
import { FileSignature, FileDown, Loader2 } from 'lucide-react';
import { Card, EmptyState, Field, Modal, StatusBadge } from '@/components/ui/primitives';
import { Select } from '@/components/shared/form-bits';
import { SignaturePad } from './signature-pad';
import { useApi, asRows } from '@/hooks/use-api';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDateTime, inr } from '@/lib/utils';
import type { Money } from '@/types';
import { Can } from '@/components/shared/can';
import { G } from '@/lib/permissions';

interface Agreement { id: string; version: number; status: string; content: string; amount: Money; paymentTerms: string; createdAt: string; template?: { name: string }; signatures: { id: string; signerName: string; signerRole: string; signedAt: string }[]; documentId?: string | null }
interface Tpl { id: string; name: string; packageType: string }

export function Agreements({ weddingId, defaultSigner }: { weddingId: string; defaultSigner: string }) {
  const r = useApi<unknown>(`/weddings/${weddingId}/agreements`);
  const tpls = asRows<Tpl>(useApi<unknown>('/agreement-templates').data);
  const [tpl, setTpl] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<Agreement | null>(null);
  const [view, setView] = useState<Agreement | null>(null);
  const [name, setName] = useState(defaultSigner);
  const [role, setRole] = useState('CLIENT');
  const [sig, setSig] = useState<string | null>(null);
  const rows = asRows<Agreement>(r.data);

  const generate = async () => {
    setBusy(true);
    try { await api.post(`/weddings/${weddingId}/agreements`, { templateId: tpl || tpls[0]?.id }); notify.ok('Agreement generated'); r.reload(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  const sign = async () => {
    if (!signing || !sig) return;
    setBusy(true);
    try { await api.post(`/agreements/${signing.id}/sign`, { signerName: name, signerRole: role, signatureData: sig }); notify.ok('Agreement signed and filed to documents'); setSigning(null); setSig(null); r.reload(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };

  return (
    <Card title="Service agreements" action={<div className="flex items-center gap-2"><Select className="w-56 !h-8 text-xs" value={tpl} onChange={setTpl} options={tpls.map((t) => ({ v: t.id, l: t.name }))} placeholder="Default template" /><Can roles={G.CRM}><button className="btn-primary btn-sm" disabled={busy || !tpls.length} onClick={generate}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}Generate</button></Can></div>}>
      {rows.length === 0 ? <EmptyState title="No agreement yet" hint="Generate one from a template using the wedding’s package, amount and payment terms." /> : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]"><p className="font-medium text-sm">{a.template?.name ?? 'Agreement'} · v{a.version}</p><p className="text-xs text-ink-soft">{inr(a.amount)} · created {fmtDateTime(a.createdAt)}{a.signatures[0] ? ` · signed by ${a.signatures[0].signerName} ${fmtDateTime(a.signatures[0].signedAt)}` : ''}</p></div>
              <StatusBadge status={a.status} />
              <button className="btn-ghost btn-sm" onClick={() => setView(a)}>View</button>
              <a className="btn-ghost btn-sm" href={apiUrl(`/agreements/${a.id}/pdf`)} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4" />PDF</a>
              {a.status !== 'SIGNED' && a.status !== 'VOID' && <Can roles={G.CRM}><button className="btn-secondary btn-sm" onClick={() => setSigning(a)}>Capture signature</button></Can>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title={`Agreement v${view?.version}`} width="max-w-2xl"><pre className="whitespace-pre-wrap font-sans text-sm leading-6">{view?.content}</pre><p className="text-xs text-ink-soft mt-4">Internal digital signature capture, not a certified qualified electronic signature.</p></Modal>
      <Modal open={!!signing} onClose={() => setSigning(null)} title="Capture signature" footer={<><button className="btn-secondary" onClick={() => setSigning(null)}>Cancel</button><button className="btn-primary" disabled={busy || !sig || !name} onClick={sign}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Sign agreement</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><Field label="Signer name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Signing as"><Select value={role} onChange={setRole} options={[{ v: 'CLIENT', l: 'Client' }, { v: 'PLANNER', l: 'Planner (The Royal Knot)' }]} /></Field></div>
          <SignaturePad onChange={setSig} />
          <p className="text-xs text-ink-soft">By signing you confirm the scope, amount ({signing ? inr(signing.amount) : ''}) and payment terms. This is an internal signature record, not a certified e-signature.</p>
        </div>
      </Modal>
    </Card>
  );
}
