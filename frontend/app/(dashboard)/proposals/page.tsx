'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, FileSignature, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Skeleton, StatCard, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Segmented, Select, SearchInput } from '@/components/shared/form-bits';
import { RoleGate } from '@/components/shared/can';
import { useApi, asRows } from '@/hooks/use-api';
import { useList } from '@/hooks/use-list';
import { api } from '@/lib/api';
import { notify } from '@/lib/toast';
import { cn, fmtDate, inr, inrCompact } from '@/lib/utils';
import type { Enquiry, Wedding } from '@/types';

interface Proposal {
  id: string; title: string; status: string; packageName: string | null; amount: string; content: string | null; validUntil: string | null; sentAt: string | null; respondedAt: string | null;
  weddingId: string | null; wedding: { id: string; name: string } | null; enquiryId: string | null; couple: string | null; agreement: { id: string; status: string; version: number } | null; amountMismatch: boolean;
}
interface Template { id: string; name: string; packageType: string; body: string }
interface Pkg { code: string; label: string; description: string }
interface Templates { templates: Template[]; packages: Pkg[] }
const STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'];

function ProposalForm({ open, onClose, onSaved, edit, tpl }: { open: boolean; onClose: () => void; onSaved: () => void; edit: Proposal | null; tpl: Templates | undefined }) {
  const weddings = asRows<Wedding>(useApi<unknown>(open ? '/weddings' : null, { pageSize: 100 }).data);
  const enquiries = asRows<Enquiry>(useApi<unknown>(open ? '/enquiries' : null, { pageSize: 100 }).data).filter((e) => !e.convertedWeddingId);
  const [f, setF] = useState(() => ({ title: edit?.title ?? '', link: edit?.weddingId ? `w:${edit.weddingId}` : edit?.enquiryId ? `e:${edit.enquiryId}` : '', pkg: edit?.packageName ?? '', amount: edit ? String(Number(edit.amount)) : '', validUntil: edit?.validUntil?.slice(0, 10) ?? '', content: edit?.content ?? '' }));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const pickPackage = (p: Pkg) => {
    const t = tpl?.templates.find((x) => x.packageType === p.code);
    setF((prev) => ({ ...prev, pkg: p.label, content: prev.content || (t?.body ?? p.description) }));
  };
  const save = async () => {
    setBusy(true);
    const [kind, id] = f.link.split(':');
    const body = { title: f.title.trim(), packageName: f.pkg || undefined, amount: f.amount ? Number(f.amount) : undefined, validUntil: f.validUntil || undefined, content: f.content || undefined };
    try {
      if (edit) await api.patch(`/proposals/${edit.id}`, { ...body, weddingId: kind === 'w' ? id : undefined });
      else await api.post('/proposals', { ...body, weddingId: kind === 'w' ? id : undefined, enquiryId: kind === 'e' ? id : undefined });
      notify.ok(edit ? 'Proposal updated' : 'Draft saved'); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={edit ? 'Edit proposal' : 'New proposal'} side width="max-w-2xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || f.title.trim().length < 2 || !f.link} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save draft</button></>}>
      <div className="space-y-5">
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sharma wedding · Full-Service" maxLength={160} /></Field>
        <Field label="For"><Select value={f.link} onChange={(v) => set('link', v)} placeholder="Choose a wedding or open enquiry…" options={[...weddings.map((w) => ({ v: `w:${w.id}`, l: `Wedding · ${w.name}` })), ...(edit ? [] : enquiries.map((e) => ({ v: `e:${e.id}`, l: `Enquiry · ${e.couple.brideName} & ${e.couple.groomName}` })))]} /></Field>
        <div>
          <p className="label">Package</p>
          <div className="grid sm:grid-cols-2 gap-3">{(tpl?.packages ?? []).map((p) => (
            <button type="button" key={p.code} onClick={() => pickPackage(p)} className={cn('text-left rounded-xl border p-3 transition-colors', f.pkg === p.label ? 'border-burgundy bg-gold-soft/50' : 'border-line hover:bg-surface-2/60')} aria-pressed={f.pkg === p.label}>
              <p className="text-sm font-medium flex items-center gap-2">{p.label}{f.pkg === p.label && <Check className="h-4 w-4 text-burgundy" />}</p><p className="text-xs text-ink-soft mt-1">{p.description || 'Custom package'}</p>
            </button>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Proposed amount (₹)"><input className="input" type="number" min={0} value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
          <Field label="Valid until"><input className="input" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></Field>
        </div>
        <Field label="Proposal text"><textarea className="input min-h-[160px] py-2" value={f.content} onChange={(e) => set('content', e.target.value)} placeholder="Scope, inclusions and terms. Picking a package pre-fills a starting point." /></Field>
      </div>
    </Modal>
  );
}

function SendModal({ p, tpl, onClose, onSent }: { p: Proposal | null; tpl: Templates | undefined; onClose: () => void; onSent: () => void }) {
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!p) return;
    setBusy(true);
    try { await api.post(`/proposals/${p.id}/send`, { templateId: templateId || undefined }); notify.ok(p.weddingId ? 'Sent for signature' : 'Marked as sent'); onSent(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!p} onClose={onClose} title="Send for signature" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</button></>}>
      {p && (
        <div className="space-y-4 text-sm">
          {p.weddingId ? (
            <>
              <p>This generates the service agreement for <b>{p.wedding?.name}</b> from the wedding’s current package and payment terms, and notifies the couple. When the agreement is signed the proposal moves to <b>Accepted</b> automatically.</p>
              <Field label="Agreement template"><Select value={templateId} onChange={setTemplateId} options={(tpl?.templates ?? []).map((t) => ({ v: t.id, l: t.name }))} placeholder="Match the wedding’s package" /></Field>
              <p className="text-xs text-ink-soft">The agreement uses the wedding’s contract value, not the proposal amount. Update the wedding first if they differ.</p>
            </>
          ) : <p>This proposal is linked to an enquiry, not a wedding yet, so no agreement can be generated. It will be marked <b>Sent</b>; record the client’s decision when you hear back, or link a wedding after conversion.</p>}
        </div>
      )}
    </Modal>
  );
}

export default function ProposalsPage() {
  const [tab, setTab] = useState<'proposals' | 'templates'>('proposals');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<{ open: boolean; edit: Proposal | null }>({ open: false, edit: null });
  const [sending, setSending] = useState<Proposal | null>(null);
  const [viewTpl, setViewTpl] = useState<Template | null>(null);
  const list = useList<Proposal>('/proposals', { status: status || undefined }, 10);
  const summary = useApi<Record<string, { count: number; amount: number }>>('/proposals/summary');
  const tpl = useApi<Templates>('/proposals/templates');
  const reloadAll = () => { list.reload(); summary.reload(); };

  const respond = async (p: Proposal, s: 'ACCEPTED' | 'DECLINED') => { try { await api.post(`/proposals/${p.id}/respond`, { status: s }); notify.ok(`Marked ${s.toLowerCase()}`); reloadAll(); } catch (e) { notify.err(e); } };
  const remove = async (p: Proposal) => { if (!confirm(`Delete draft "${p.title}"?`)) return; try { await api.del(`/proposals/${p.id}`); notify.ok('Draft deleted'); reloadAll(); } catch (e) { notify.err(e); } };

  const cols: ColumnDef<Proposal, unknown>[] = [
    { id: 'title', header: 'Proposal', enableSorting: false, cell: ({ row: { original: p } }) => <div><button className="font-medium text-left hover:underline" onClick={() => p.status === 'DRAFT' ? setForm({ open: true, edit: p }) : undefined}>{p.title}</button><p className="text-xs text-ink-soft">{p.couple ?? '—'}{p.wedding ? ` · ${p.wedding.name}` : ' · Enquiry'}</p></div> },
    { id: 'pkg', header: 'Package', enableSorting: false, cell: ({ row: { original: p } }) => p.packageName ?? '—' },
    { id: 'amount', header: 'Amount', enableSorting: false, cell: ({ row: { original: p } }) => <span className="num">{inr(p.amount)}</span> },
    { id: 'status', header: 'Status', enableSorting: false, cell: ({ row: { original: p } }) => <div><StatusBadge status={p.status} />{p.agreement && <p className="text-xs text-ink-soft mt-1">Agreement v{p.agreement.version}: {p.agreement.status.toLowerCase()}</p>}{p.amountMismatch && <p className="text-xs text-[#A8701A] mt-0.5">Differs from contract value</p>}</div> },
    { id: 'dates', header: 'Sent / valid until', enableSorting: false, cell: ({ row: { original: p } }) => <div className="whitespace-nowrap text-xs"><p>{p.sentAt ? `Sent ${fmtDate(p.sentAt)}` : 'Not sent'}</p><p className="text-ink-soft">{p.validUntil ? `Valid to ${fmtDate(p.validUntil)}` : ''}</p></div> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: p } }) => (
      <span className="flex gap-1 justify-end whitespace-nowrap">
        {p.status === 'DRAFT' && <><button className="btn-secondary btn-sm" onClick={() => setSending(p)}><Send className="h-3.5 w-3.5" />Send</button><button className="btn-ghost btn-sm !px-2" aria-label={`Delete ${p.title}`} onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button></>}
        {(p.status === 'SENT' || p.status === 'VIEWED') && <><button className="btn-ghost btn-sm" onClick={() => respond(p, 'ACCEPTED')}><Check className="h-4 w-4" />Accepted</button><button className="btn-ghost btn-sm" onClick={() => respond(p, 'DECLINED')}><X className="h-4 w-4" />Declined</button></>}
        {p.wedding && p.agreement && <Link className="btn-ghost btn-sm" href={`/weddings/${p.wedding.id}`}>Agreement</Link>}
      </span>) },
  ];

  const s = summary.data ?? {};
  return (
    <RoleGate roles={['PLANNER']}>
      <PageHeader title="Proposals & Agreements" subtitle="Draft a proposal, pick a package, send it for signature." actions={<><Segmented value={tab} onChange={setTab} options={[{ v: 'proposals', l: 'Proposals' }, { v: 'templates', l: 'Templates' }]} /><button className="btn-primary" onClick={() => setForm({ open: true, edit: null })}><Plus className="h-4 w-4" />New proposal</button></>} />
      {tab === 'proposals' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Drafts" value={s.DRAFT?.count ?? 0} hint={inrCompact(s.DRAFT?.amount ?? 0)} />
            <StatCard label="Awaiting signature" value={(s.SENT?.count ?? 0) + (s.VIEWED?.count ?? 0)} hint={inrCompact((s.SENT?.amount ?? 0) + (s.VIEWED?.amount ?? 0))} />
            <StatCard label="Accepted" value={s.ACCEPTED?.count ?? 0} hint={inrCompact(s.ACCEPTED?.amount ?? 0)} />
            <StatCard label="Declined" value={s.DECLINED?.count ?? 0} hint={inrCompact(s.DECLINED?.amount ?? 0)} />
          </div>
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
              <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search proposals…" />
              <Select className="w-44" value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={STATUSES} placeholder="All statuses" />
            </div>
            <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No proposals yet" emptyHint="Create one for an open enquiry or an existing wedding." />
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
          </Card>
        </>
      ) : (
        <Card title="Agreement & proposal templates">
          {tpl.loading ? <Skeleton className="h-32" /> : tpl.error ? <ErrorState message={tpl.error} onRetry={tpl.reload} />
            : !tpl.data?.templates.length ? <EmptyState title="No templates" />
            : <ul className="divide-y divide-line">{tpl.data.templates.map((t) => (
              <li key={t.id} className="py-3 flex flex-wrap items-center gap-3"><FileSignature className="h-5 w-5 text-burgundy shrink-0" /><div className="flex-1 min-w-[200px]"><p className="font-medium text-sm">{t.name}</p><p className="text-xs text-ink-soft">{t.packageType === 'FULL_SERVICE' ? 'Full-Service' : 'Partial / Day-of'} · used when sending for signature and as proposal starter text</p></div><button className="btn-secondary btn-sm" onClick={() => setViewTpl(t)}>Preview</button></li>
            ))}</ul>}
        </Card>
      )}
      <ProposalForm key={`${form.open}-${form.edit?.id ?? 'new'}`} open={form.open} edit={form.edit} tpl={tpl.data ?? undefined} onClose={() => setForm({ open: false, edit: null })} onSaved={reloadAll} />
      <SendModal p={sending} tpl={tpl.data ?? undefined} onClose={() => setSending(null)} onSent={reloadAll} />
      <Modal open={!!viewTpl} onClose={() => setViewTpl(null)} title={viewTpl?.name ?? ''} width="max-w-2xl"><pre className="whitespace-pre-wrap font-sans text-sm leading-6">{viewTpl?.body}</pre><p className="text-xs text-ink-soft mt-4">{'{{placeholders}}'} are filled from the wedding when the agreement is generated.</p></Modal>
    </RoleGate>
  );
}
