import { describe, it, expect, beforeEach } from 'vitest';
import { DRAFT_KEY, parseDraft } from './judge-draft';

describe('judge-draft', () => {
  describe('DRAFT_KEY', () => {
    it('builds a stable key from judgeSessionId + competitorId', () => {
      expect(DRAFT_KEY('jsess-1', 'comp-1')).toBe('judge-draft-jsess-1-comp-1');
    });
  });

  describe('parseDraft', () => {
    it('returns empty object for null input', () => {
      expect(parseDraft(null)).toEqual({});
    });

    it('returns empty object for empty string', () => {
      expect(parseDraft('')).toEqual({});
    });

    it('returns empty object for malformed JSON', () => {
      expect(parseDraft('not-valid-json{')).toEqual({});
    });

    it('returns empty object when JSON is an array', () => {
      expect(parseDraft('[]')).toEqual({});
    });

    it('returns empty object when JSON is a primitive', () => {
      expect(parseDraft('"a-string"')).toEqual({});
      expect(parseDraft('42')).toEqual({});
      expect(parseDraft('null')).toEqual({});
    });

    it('preserves only string-valued entries from a record', () => {
      const raw = JSON.stringify({
        crit1: '8.50',
        crit2: '9.00',
        ignored: 42,
        alsoIgnored: null,
        nested: { foo: 'bar' },
      });
      expect(parseDraft(raw)).toEqual({ crit1: '8.50', crit2: '9.00' });
    });

    it('round-trips a typical draft via localStorage (AC #5 regression)', () => {
      const sessionId = 'jsess-roundtrip';
      const competitorId = 'comp-roundtrip';
      const draft = { crit1: '7.25', crit2: '8.00' };

      // Write as the form does on every keystroke.
      localStorage.setItem(DRAFT_KEY(sessionId, competitorId), JSON.stringify(draft));

      // Read back as the page does on remount (simulates page refresh / crash recovery).
      const restored = parseDraft(localStorage.getItem(DRAFT_KEY(sessionId, competitorId)));
      expect(restored).toEqual(draft);

      localStorage.removeItem(DRAFT_KEY(sessionId, competitorId));
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });
});
