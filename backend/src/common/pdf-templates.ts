const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
export const inr = (v: unknown) => '₹' + Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const dt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');

export const page = (title: string, subtitle: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Helvetica,Arial,sans-serif;color:#242124;font-size:12px;line-height:1.5}
.head{background:#401827;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:20px}
.brand{font-family:Georgia,serif;font-size:22px;letter-spacing:.5px}.gold{color:#C6A46A;font-size:10px;letter-spacing:2px;text-transform:uppercase}
h1{font-family:Georgia,serif;font-size:20px;margin:0 0 4px;color:#401827}h2{font-size:13px;margin:18px 0 6px;color:#401827;text-transform:uppercase;letter-spacing:1px}
table{width:100%;border-collapse:collapse;margin:6px 0}th{background:#F0ECE6;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}td{padding:6px 8px;border-bottom:1px solid #E9E4DE}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:bold;border-top:2px solid #401827}
.muted{color:#777078}.sig{margin-top:30px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #777078;padding-top:6px}.sig img{max-height:60px}
</style></head><body><div class="head"><div class="gold">The Royal Knot · Wedding Management</div><div class="brand">${esc(title)}</div><div class="muted" style="color:#E9E4DE">${esc(subtitle)}</div></div>${body}</body></html>`;

export const table = (headers: { label: string; num?: boolean }[], rows: (string | number)[][], foot?: (string | number)[]) =>
  `<table><tr>${headers.map((h) => `<th class="${h.num ? 'n' : ''}">${esc(h.label)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${headers[i]?.num ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`)
    .join('')}${foot ? `<tr class="tot">${foot.map((c, i) => `<td class="${headers[i]?.num ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>` : ''}</table>`;

export const kv = (rows: [string, unknown][]) => `<table>${rows.map(([k, v]) => `<tr><td class="muted" style="width:35%">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
export const raw = (html: string) => html;
export { esc };
