import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordTurnObserved,
  recordScrollSnapshot,
  resetCoverage,
  _resetAllCoverage,
  assessCoverage,
  getCoverageDiagnostics,
} from '../../extension/src/core/coverage.js';

test('assessCoverage returns unknown when nothing observed', () => {
  _resetAllCoverage();
  assert.equal(assessCoverage('conv-a'), 'unknown');
});

test('assessCoverage returns partial when turns observed but top not witnessed', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 42);
  recordTurnObserved('conv-a', 43);
  recordTurnObserved('conv-a', 44);
  assert.equal(assessCoverage('conv-a'), 'partial');
});

test('assessCoverage returns partial when top witnessed but gaps exist', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-a', 2);
  // Gap: 3 is missing.
  recordTurnObserved('conv-a', 4);
  recordTurnObserved('conv-a', 5);
  recordScrollSnapshot('conv-a', { scrollTop: 0, anyTurnMounted: true });
  assert.equal(assessCoverage('conv-a'), 'partial');
});

test('assessCoverage returns full only when top witnessed AND contiguous', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-a', 2);
  recordTurnObserved('conv-a', 3);
  recordScrollSnapshot('conv-a', { scrollTop: 0, anyTurnMounted: true });
  assert.equal(assessCoverage('conv-a'), 'full');
});

test('scroll snapshot ignored when no turns are mounted', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 5);
  recordScrollSnapshot('conv-a', { scrollTop: 0, anyTurnMounted: false });
  assert.equal(assessCoverage('conv-a'), 'partial');
});

test('scroll snapshot tolerates minor scroll bounce (<= 20px)', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-a', 2);
  recordScrollSnapshot('conv-a', { scrollTop: 18, anyTurnMounted: true });
  assert.equal(assessCoverage('conv-a'), 'full');
});

test('scroll snapshot beyond bounce threshold does NOT witness top', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-a', 2);
  recordScrollSnapshot('conv-a', { scrollTop: 200, anyTurnMounted: true });
  assert.equal(assessCoverage('conv-a'), 'partial');
});

test('topAnchorWitnessed is monotonic — once true, stays true', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordScrollSnapshot('conv-a', { scrollTop: 0, anyTurnMounted: true });
  // User scrolls back down — should NOT flip anchor off.
  recordScrollSnapshot('conv-a', { scrollTop: 5000, anyTurnMounted: true });
  const diag = getCoverageDiagnostics('conv-a');
  assert.equal(diag.topAnchorWitnessed, true);
});

test('resetCoverage wipes only the given conversation', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-b', 1);
  resetCoverage('conv-a');
  assert.equal(assessCoverage('conv-a'), 'unknown');
  assert.equal(assessCoverage('conv-b'), 'partial');
});

test('non-integer / negative / non-finite turn indices are ignored', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 'abc');
  recordTurnObserved('conv-a', -3);
  recordTurnObserved('conv-a', 1.5);
  recordTurnObserved('conv-a', NaN);
  assert.equal(assessCoverage('conv-a'), 'unknown');
});

test('getCoverageDiagnostics returns gapCount for partial coverage', () => {
  _resetAllCoverage();
  recordTurnObserved('conv-a', 1);
  recordTurnObserved('conv-a', 3);
  recordTurnObserved('conv-a', 5);
  recordScrollSnapshot('conv-a', { scrollTop: 0, anyTurnMounted: true });
  const diag = getCoverageDiagnostics('conv-a');
  assert.equal(diag.observedCount, 3);
  assert.equal(diag.gapCount, 2, 'missing indices 2 and 4');
  assert.equal(diag.coverage, 'partial');
});
