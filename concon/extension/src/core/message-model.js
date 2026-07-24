// MessageRecord factory + minimal validation.
//
// ConCon never invents message ids. Every record must carry the id
// emitted by ChatGPT's backend (data-message-id) and the conversationId
// parsed from the URL. Roles are constrained to the three ChatGPT uses.

const VALID_ROLES = new Set(['user', 'assistant', 'system']);

export function makeMessageRecord({
  id,
  conversationId,
  role,
  text,
  observedAt,
  order,
}) {
  if (!id) throw new Error('MessageRecord requires id');
  if (!conversationId) throw new Error('MessageRecord requires conversationId');
  if (!VALID_ROLES.has(role)) throw new Error(`Invalid role: ${role}`);
  return {
    id,
    conversationId,
    role,
    text: text || '',
    observedAt: observedAt || Date.now(),
    order: order ?? 0,
    // Fields reserved for later phases:
    extractedAt: null,
    extractionModelVersion: null,
  };
}

export function isSameContent(a, b) {
  return !!a && !!b && a.id === b.id && a.text === b.text;
}
