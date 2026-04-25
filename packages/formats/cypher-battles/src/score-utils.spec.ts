import { describe, it, expect } from 'vitest';
import {
  addScores,
  sumScores,
  formatScore,
  validateScoreString,
  compareScores,
} from '@competition-platform/format-sdk';

describe('addScores', () => {
  it('adds two score strings', () => {
    expect(addScores('3.50', '4.25')).toBe('7.75');
  });

  it('handles zeros', () => {
    expect(addScores('0.00', '0.00')).toBe('0.00');
  });

  it('returns 2 decimal places', () => {
    expect(addScores('1.10', '2.20')).toBe('3.30');
  });
});

describe('sumScores', () => {
  it('sums an array of score strings', () => {
    expect(sumScores(['3.00', '4.00', '5.00'])).toBe('12.00');
  });

  it('returns 0.00 for empty array', () => {
    expect(sumScores([])).toBe('0.00');
  });

  it('handles single element', () => {
    expect(sumScores(['7.50'])).toBe('7.50');
  });
});

describe('formatScore', () => {
  it('formats a number to 2 decimal places by default', () => {
    expect(formatScore(8.5)).toBe('8.50');
  });

  it('respects custom precision', () => {
    expect(formatScore(8.5, 1)).toBe('8.5');
  });
});

describe('validateScoreString', () => {
  it('returns true for valid score in range', () => {
    expect(validateScoreString('5.00', 0, 10)).toBe(true);
  });

  it('returns true at min boundary', () => {
    expect(validateScoreString('0.00', 0, 10)).toBe(true);
  });

  it('returns true at max boundary', () => {
    expect(validateScoreString('10.00', 0, 10)).toBe(true);
  });

  it('returns false below min', () => {
    expect(validateScoreString('-1.00', 0, 10)).toBe(false);
  });

  it('returns false above max', () => {
    expect(validateScoreString('10.01', 0, 10)).toBe(false);
  });

  it('returns false for non-numeric string', () => {
    expect(validateScoreString('abc', 0, 10)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateScoreString('', 0, 10)).toBe(false);
  });
});

describe('compareScores', () => {
  it('returns negative when a < b', () => {
    expect(compareScores('3.00', '7.00')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareScores('9.00', '2.00')).toBeGreaterThan(0);
  });

  it('returns 0 when equal', () => {
    expect(compareScores('5.00', '5.00')).toBe(0);
  });
});
