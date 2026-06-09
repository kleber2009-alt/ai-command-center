'use client';

import { useRef, useState } from 'react';

/**
 * Bulk content import (Stage 5). Accepts a JSON array or a CSV with columns:
 * kind,globalOrder,locale,body,optionsJson[,mediaUrl,mediaKind] — parsed
 * client-side into the /api/admin/import shape.
 */
interface Row {
  kind: string;
  globalOrder?: number;
  locale: string;
  body: string;
  options?: unknown;
  mediaUrl?: string | null;
  mediaKind?: string;
}

export function ImportButton({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  async function handle(file: File) {
    setStatus('Парсинг…');
    try {
      const text = await file.text();
      const items = file.name.endsWith('.csv') ? parseCsv(text) : (JSON.parse(text) as Row[]);
      if (!Array.isArray(items) || items.length === 0) throw new Error('пустой файл');

      setStatus(`Импорт ${items.length} строк…`);
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? 'ошибка импорта');
      const d = json.data;
      setStatus(`Готово: создано ${d.itemsCreated}, переводов ${d.translationsUpserted}${d.errors?.length ? `, ошибок ${d.errors.length}` : ''}`);
      onDone();
    } catch (e: any) {
      setStatus(`Ошибка: ${e.message}`);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={ref}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
      <button onClick={() => ref.current?.click()} className="rounded-md bg-neutral-900 px-3 py-2 text-xs text-white">
        Импорт CSV/JSON
      </button>
      {status ? <span className="text-xs text-neutral-500">{status}</span> : null}
    </div>
  );
}

/** Minimal CSV parser: header row, comma-separated, optionsJson column holds JSON. */
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h.trim()] = cells[i] ?? ''));
    return {
      kind: rec.kind,
      globalOrder: rec.globalOrder ? Number(rec.globalOrder) : undefined,
      locale: rec.locale,
      body: rec.body,
      options: rec.optionsJson ? JSON.parse(rec.optionsJson) : undefined,
      mediaUrl: rec.mediaUrl || undefined,
      mediaKind: rec.mediaKind || undefined,
    };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}
