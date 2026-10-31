'use client';
import { useRef, useState } from 'react';
import { Film, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Card, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Skeleton } from '@/components/ui/primitives';
import { Segmented, Select } from '@/components/shared/form-bits';
import { useList } from '@/hooks/use-list';
import { api, apiUrl } from '@/lib/api';
import { notify } from '@/lib/toast';
import { fmtDate } from '@/lib/utils';

interface Asset { id: string; kind: string; title: string | null; mimeType: string; size: number; album: string; mine: boolean; uploadedByName: string | null; createdAt: string; wedding: { id: string; name: string } | null }
const ALBUMS = [{ v: '', l: 'All' }, { v: 'gallery', l: 'Gallery' }, { v: 'vendor', l: 'Vendors' }, { v: 'design-ideas', l: 'Design ideas' }];
const BASE = '/portal/client/media';
const MAX_MB = 25;

function UploadModal({ open, onClose, onSaved, defaultAlbum }: { open: boolean; onClose: () => void; onSaved: () => void; defaultAlbum: string }) {
  const pick = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [album, setAlbum] = useState(defaultAlbum || 'design-ideas');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const choose = (f?: File) => { if (!f) return; if (f.size > MAX_MB * 1048576) { notify.err(new Error(`File exceeds ${MAX_MB} MB limit`)); return; } setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try { const fd = new FormData(); fd.append('file', file); fd.append('album', album); if (title.trim()) fd.append('title', title.trim()); await api.upload(BASE, fd); notify.ok('Photo added'); setFile(null); setTitle(''); onSaved(); onClose(); } catch (e) { notify.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add photo or reference image" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!file || busy} onClick={upload}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Upload</button></>}>
      <input ref={pick} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4" onChange={(e) => choose(e.target.files?.[0])} />
      <button className="w-full border-2 border-dashed border-line rounded-xl py-8 text-sm text-ink-soft hover:bg-surface-2/50 mb-4" onClick={() => pick.current?.click()}><ImagePlus className="h-5 w-5 mx-auto mb-2" />{file ? file.name : `Choose an image or MP4 (max ${MAX_MB} MB)`}</button>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Album"><Select value={album} onChange={setAlbum} options={ALBUMS.filter((a) => a.v && a.v !== 'vendor')} /></Field>
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>
      </div>
    </Modal>
  );
}

export default function Page() {
  const [album, setAlbum] = useState('');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<Asset | null>(null);
  const list = useList<Asset>(BASE, { album: album || undefined }, 24);

  const remove = async (a: Asset) => {
    if (!confirm(`Delete "${a.title ?? 'this file'}"?`)) return;
    try { await api.del(`${BASE}/${a.id}`); notify.ok('Deleted'); setView(null); list.reload(); } catch (e) { notify.err(e); }
  };

  return (
    <>
      <PageHeader title="Photos & Media" subtitle="Your wedding gallery, vendor shots and reference images for the design team." actions={<button className="btn-primary" onClick={() => setAdding(true)}><ImagePlus className="h-4 w-4" />Add photos</button>} />
      <div className="mb-4"><Segmented value={album} onChange={(v) => { setAlbum(v); list.setPage(1); }} options={ALBUMS} /></div>
      <Card pad={false}>
        {list.loading ? <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square h-auto" />)}</div>
          : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
          : list.rows.length === 0 ? <EmptyState title="No photos here yet" hint="Upload inspiration, venue references or your own shots. Your planner sees them too." action={<button className="btn-secondary btn-sm" onClick={() => setAdding(true)}>Add photos</button>} />
          : <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{list.rows.map((a) => (
            <button key={a.id} onClick={() => setView(a)} className="group text-left rounded-xl overflow-hidden border border-line bg-surface-2 hover:shadow-pop transition-shadow">
              <div className="aspect-square bg-surface-2 grid place-items-center overflow-hidden">
                {a.mimeType.startsWith('image/') ? <img src={apiUrl(`${BASE}/${a.id}/file`)} alt={a.title ?? 'Photo'} loading="lazy" className="h-full w-full object-cover" /> : <Film className="h-8 w-8 text-ink-soft" />}
              </div>
              <div className="p-2.5 bg-white"><p className="text-xs font-medium truncate">{a.title ?? 'Untitled'}</p><p className="text-[11px] text-ink-soft truncate">{a.mine ? 'You' : a.uploadedByName ?? 'Planner'} · {fmtDate(a.createdAt, 'dd MMM')}</p></div>
            </button>
          ))}</div>}
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      </Card>
      <UploadModal key={String(adding)} open={adding} onClose={() => setAdding(false)} onSaved={list.reload} defaultAlbum={album} />
      <Modal open={!!view} onClose={() => setView(null)} title={view?.title ?? 'Photo'} width="max-w-3xl" footer={view?.mine ? <button className="btn-secondary" onClick={() => view && remove(view)}><Trash2 className="h-4 w-4" />Delete</button> : undefined}>
        {view && (view.mimeType.startsWith('image/') ? <img src={apiUrl(`${BASE}/${view.id}/file`)} alt={view.title ?? 'Photo'} className="max-h-[70vh] mx-auto rounded-lg" /> : <video src={apiUrl(`${BASE}/${view.id}/file`)} controls className="max-h-[70vh] mx-auto rounded-lg" />)}
        {view && <p className="text-xs text-ink-soft text-center mt-3 capitalize">{view.album.replace('-', ' ')} · added by {view.mine ? 'you' : view.uploadedByName ?? 'your planner'} on {fmtDate(view.createdAt)}</p>}
      </Modal>
    </>
  );
}
