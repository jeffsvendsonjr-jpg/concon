// Literal (substring, case-insensitive) search across the conversation.
//
// Two surfaces:
//   - searchLedger: filters ledger entries whose sentence contains the query.
//   - searchTranscript: filters raw messages whose full text contains the
//     query. Useful for showing "N more matches outside the ledger" — content
//     the assistant said in passing that didn't rise to a ledger entry.
//   - highlightMatch: splits a string around the first occurrence of the
//     query so the panel can render <span class="hit">…</span>.
//
// Pure functions; no DOM, no store. Safe to unit-test in Node.

export function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

export function searchLedger(ledger, query) {
  const q = normalizeQuery(query);
  const hasQuery = q.length > 0;
  if (!hasQuery || !ledger?.entries?.length) {
    return { matches: [], hasQuery };
  }
  const matches = ledger.entries.filter((e) =>
    String(e.sentence || '').toLowerCase().includes(q)
  );
  return { matches, hasQuery };
}

export function searchTranscript(messages, query) {
  const q = normalizeQuery(query);
  const hasQuery = q.length > 0;
  if (!hasQuery || !messages?.length) {
    return { turns: [], hasQuery };
  }
  const turns = messages.filter((m) =>
    String(m.text || '').toLowerCase().includes(q)
  );
  return { turns, hasQuery };
}

export function countTranscriptOnly(ledger, messages, query) {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const ledgerTurnIds = new Set(
    (ledger?.entries || [])
      .filter((e) => String(e.sentence || '').toLowerCase().includes(q))
      .map((e) => e.sourceMessageId)
  );
  let count = 0;
  for (const m of messages || []) {
    if (ledgerTurnIds.has(m.id)) continue;
    if (String(m.text || '').toLowerCase().includes(q)) count += 1;
  }
  return count;
}

export function highlightMatch(text, query) {
  const q = normalizeQuery(query);
  const src = String(text ?? '');
  if (!q) return { pre: src, match: '', post: '' };
  const idx = src.toLowerCase().indexOf(q);
  if (idx === -1) return { pre: src, match: '', post: '' };
  return {
    pre: src.slice(0, idx),
    match: src.slice(idx, idx + q.length),
    post: src.slice(idx + q.length),
  };
}
