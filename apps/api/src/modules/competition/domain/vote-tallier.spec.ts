import { describe, it, expect } from 'vitest';
import { tallyMatchup, type VoteTally } from './vote-tallier';

const A = 'competitor-a';
const B = 'competitor-b';

function tally(p1: number, p2: number, t: number): VoteTally {
  return { player1: p1, player2: p2, tie: t, total: p1 + p2 + t };
}

describe('tallyMatchup', () => {
  it('returns pending when fewer than expected votes are recorded', () => {
    const result = tallyMatchup({
      tally: tally(0, 0, 0),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('pending');
  });

  it('returns pending when 1 of 3 expected votes recorded (no early-decide)', () => {
    const result = tallyMatchup({
      tally: tally(1, 0, 0),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('pending');
  });

  it('returns pending at 3 of 5 even with mathematical-majority', () => {
    const result = tallyMatchup({
      tally: tally(3, 0, 0),
      expectedVotes: 5,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('pending');
  });

  it('returns winner A on clear plurality (2 player1, 1 player2, 0 tie)', () => {
    const result = tallyMatchup({
      tally: tally(2, 1, 0),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result).toEqual({
      kind: 'winner',
      winnerCompetitorId: A,
      tally: tally(2, 1, 0),
    });
  });

  it('returns winner B on clear plurality (1 player1, 2 player2, 0 tie)', () => {
    const result = tallyMatchup({
      tally: tally(1, 2, 0),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('winner');
    if (result.kind === 'winner') {
      expect(result.winnerCompetitorId).toBe(B);
    }
  });

  it('returns winner A when tie option does not block plurality (2/0/1)', () => {
    const result = tallyMatchup({
      tally: tally(2, 0, 1),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('winner');
    if (result.kind === 'winner') {
      expect(result.winnerCompetitorId).toBe(A);
    }
  });

  it('returns tie on 1/1/1 split (named-competitor split)', () => {
    const result = tallyMatchup({
      tally: tally(1, 1, 1),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('tie');
  });

  it('returns tie on 2/2/0 split', () => {
    const result = tallyMatchup({
      tally: tally(2, 2, 0),
      expectedVotes: 4,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('tie');
  });

  it('returns tie when everyone votes tie (0/0/3)', () => {
    const result = tallyMatchup({
      tally: tally(0, 0, 3),
      expectedVotes: 3,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('tie');
  });

  it('returns tie on 1/1/3 (5 of 5, tie option leads)', () => {
    const result = tallyMatchup({
      tally: tally(1, 1, 3),
      expectedVotes: 5,
      competitorAId: A,
      competitorBId: B,
    });
    expect(result.kind).toBe('tie');
  });
});
