'use client';
import { useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, FileText, Upload, Loader2 } from 'lucide-react';
import { Card, Field, Modal, Pagination, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/shared/data-table';
import { Select, SearchInput } from '@/components/shared/form-bits';
import { useList } from '@/hooks/use-list';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { DOC_CATEGORIES, ROLES } from '@/lib/enums';
import { fmtDate, humanize } from '@/lib/utils';
import type { DocumentRow } from '@/types';

const MAX_MB = 25;
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function UploadModal({ weddingId, versionOf, open, onClose, onSaved }: { weddingId?: string; versionOf?: DocumentRow | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('OTHER');
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pick = (f?: File) => {
    if (!f) return;
    if (f.size > MAX_MB * 1048576) { notify.err(new Error(`File exceeds ${MAX_MB} MB limit`)); return; }
    setFile(f);
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('category', versionOf?.category ?? category);
      const wid = versionOf?.weddingId ?? weddingId;
      if (wid) fd.append('weddingId', wid);
      if (versionOf) fd.append('documentKey', versionOf.documentKey);
      if (roles.length) fd.append('roles', roles.join(','));
      await api.upload('/documents', fd);
      notify.ok(versionOf ? `Uploaded version ${versionOf.version + 1}` : 'Document uploaded'); setFile(null); setRoles([]); onSaved(); onClose();
    } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={versionOf ? `New version of ${versionOf.name}` : 'Upload document'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !file} onClick={upload}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Upload</button></>}>
      <input ref={ref} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => pick(e.target.files?.[0])} />
      <button className="w-full border-2 border-dashed border-line rounded-xl py-8 text-sm text-ink-soft hover:bg-surface-2/50 mb-4" onClick={() => ref.current?.click()}><Upload className="h-5 w-5 mx-auto mb-2" />{file ? `${file.name} · ${size(file.size)}` : `Choose a file (max ${MAX_MB} MB)`}</button>
      {!versionOf && <Field label="Category" className="mb-4"><Select value={category} onChange={setCategory} options={DOC_CATEGORIES} /></Field>}
      <div><p className="label">Restrict access to roles <span className="font-normal">(leave empty for all staff)</span></p><div className="flex flex-wrap gap-x-4 gap-y-2">{ROLES.map((x) => <label key={x.v} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#401827]" checked={roles.includes(x.v)} onChange={() => setRoles((p) => p.includes(x.v) ? p.filter((y) => y !== x.v) : [...p, x.v])} />{x.l}</label>)}</div></div>
      <p className="text-xs text-ink-soft mt-3">Allowed: PDF, images, Office files, CSV, text. Admins and the uploader can always access a file.</p>
    </Modal>
  );
}

export function DocumentsPanel({ weddingId }: { weddingId?: string }) {
  const [category, setCategory] = useState('');
  const [upload, setUpload] = useState<{ open: boolean; versionOf?: DocumentRow }>({ open: false });
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const list = useList<DocumentRow>('/documents', { weddingId, category: category || undefined }, 12);

  const cols: ColumnDef<DocumentRow, unknown>[] = [
    { id: 'name', header: 'Document', enableSorting: false, cell: ({ row: { original: d } }) => <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-surface-2 grid place-items-center"><FileText className="h-4 w-4 text-burgundy" /></div><div className="min-w-0"><p className="font-medium truncate">{d.name}</p><p className="text-xs text-ink-soft">{d.mimeType.split('/')[1]} · {size(d.size)}</p></div></div> },
    { id: 'category', header: 'Category', enableSorting: false, cell: ({ row: { original: d } }) => <StatusBadge status={d.category} tone="gold" /> },
    ...(weddingId ? [] : [{ id: 'wedding', header: 'Wedding', enableSorting: false, cell: ({ row: { original: d } }: { row: { original: DocumentRow } }) => d.wedding?.name ?? '—' } as ColumnDef<DocumentRow, unknown>]),
    { id: 'version', header: 'Version', enableSorting: false, cell: ({ row: { original: d } }) => `v${d.version}` },
    { id: 'by', header: 'Uploaded', enableSorting: false, cell: ({ row: { original: d } }) => <div className="whitespace-nowrap">{d.uploadedBy?.name ?? 'System'}<p className="text-xs text-ink-soft">{fmtDate(d.createdAt)}</p></div> },
    { id: 'access', header: 'Access', enableSorting: false, cell: ({ row: { original: d } }) => <span className="text-xs text-ink-soft">{d.allowedRoles.length ? d.allowedRoles.map(humanize).join(', ') : 'All staff'}</span> },
    { id: 'act', header: '', enableSorting: false, cell: ({ row: { original: d } }) => <span className="flex gap-1 justify-end"><button className="btn-ghost btn-sm !px-2" aria-label={`Upload new version of ${d.name}`} title="Upload new version" onClick={() => setUpload({ open: true, versionOf: d })}><Upload className="h-4 w-4" /></button><button className="btn-ghost btn-sm !px-2" aria-label={`Preview ${d.name}`} onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></button><a className="btn-ghost btn-sm !px-2" aria-label={`Download ${d.name}`} href={apiUrl(`/documents/${d.id}/download`)}><Download className="h-4 w-4" /></a></span> },
  ];
  const canPreview = preview && /^(image\/|application\/pdf)/.test(preview.mimeType);

  return (
    <>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
          <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search documents…" />
          <Select className="w-48" value={category} onChange={(v) => { setCategory(v); list.setPage(1); }} options={DOC_CATEGORIES} placeholder="All categories" />
          <button className="btn-primary ml-auto" onClick={() => setUpload({ open: true })}><Upload className="h-4 w-4" />Upload</button>
        </div>
        <DataTable columns={cols} data={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} emptyTitle="No documents" emptyHint="Agreements, quotations, invoices and floor plans live here." />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <UploadModal weddingId={weddingId} versionOf={upload.versionOf} open={upload.open} onClose={() => setUpload({ open: false })} onSaved={list.reload} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} width="max-w-4xl" footer={preview && <a className="btn-primary" href={apiUrl(`/documents/${preview.id}/download`)}><Download className="h-4 w-4" />Download</a>}>
        {preview && (canPreview
          ? (preview.mimeType.startsWith('image/') ? <img src={apiUrl(`/documents/${preview.id}/preview`)} alt={preview.name} className="max-h-[70vh] mx-auto rounded-lg" /> : <iframe title={preview.name} src={apiUrl(`/documents/${preview.id}/preview`)} className="w-full h-[70vh] rounded-lg border border-line" />)
          : <p className="text-sm text-ink-soft py-10 text-center">Preview isn’t available for this file type. Download it to view.</p>)}
      </Modal>
    </>
  );
}
