'use client';
import { FileText } from 'lucide-react';
import { apiUrl } from '@/lib/api';

export const CATEGORIES = ['General', 'Planning', 'Payments', 'Guests', 'Vendors', 'Accommodation', 'Transport', 'Technical', 'Other'] as const;
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export interface FeedbackRow {
  id: string; kind: 'REQUEST' | 'FEEDBACK' | 'SUPPORT'; status: string; category: string | null; subject: string; body: string; rating: number | null; response: string | null;
  weddingId: string | null; wedding: { id: string; name: string } | null; submittedBy: { id: string; name: string; role: string } | null; assignedTo: { id: string; name: string } | null;
  attachments: { id: string; name: string; mimeType: string; size: number }[]; resolvedAt: string | null; createdAt: string; updatedAt: string;
}

export function AttachmentLinks({ base, id, items }: { base: string; id: string; items: FeedbackRow['attachments'] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-2 mt-2">{items.map((a) => <a key={a.id} href={apiUrl(`${base}/${id}/attachments/${a.id}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 hover:bg-gold-soft px-3 py-1 text-xs"><FileText className="h-3.5 w-3.5" />{a.name}</a>)}</div>;
}
