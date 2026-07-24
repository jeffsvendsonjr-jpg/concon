// Outline state = segmentation output + preservation of user-confirmed labels.
//
// This module is deliberately thin. The interesting logic lives in
// segmenter.js. Outline exists so consumers of the store have a single
// object to read (`conv.outline`) that is version-friendly.

import { segment } from './segmenter.js';

/**
 * updateOutline(prev, messages) → OutlineState
 *
 * Runs segmentation over the current messages. Any topic in `prev` that
 * was labelConfirmed=true has its label carried forward if the same
 * firstTurnId still leads a topic.
 */
export function updateOutline(prev, messages) {
  const topics = segment(messages);
  if (prev && Array.isArray(prev.topics)) {
    const prevByFirst = new Map(prev.topics.map((t) => [t.firstTurnId, t]));
    for (const t of topics) {
      const p = prevByFirst.get(t.firstTurnId);
      if (p && p.labelConfirmed) {
        t.label = p.label;
        t.labelConfirmed = true;
      }
    }
  }
  return { topics, updatedAt: Date.now() };
}
