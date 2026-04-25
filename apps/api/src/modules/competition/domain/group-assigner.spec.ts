import { describe, it, expect } from 'vitest';
import { roundRobinAssign } from './group-assigner';

describe('roundRobinAssign', () => {
  it('distributes 6 items across 3 groups evenly', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
    const result = roundRobinAssign(items, 3);
    expect(result.map((r) => r.groupIndex)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('distributes 7 items across 3 groups with off-by-one acceptable', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
    const result = roundRobinAssign(items, 3);
    expect(result.map((r) => r.groupIndex)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    const groupCounts = [0, 1, 2].map(
      (g) => result.filter((r) => r.groupIndex === g).length,
    );
    // Groups 0 gets 3, groups 1 and 2 get 2
    expect(groupCounts).toEqual([3, 2, 2]);
  });

  it('assigns 1 item to 1 group', () => {
    const items = [{ id: 'a' }];
    const result = roundRobinAssign(items, 1);
    expect(result).toEqual([{ id: 'a', groupIndex: 0 }]);
  });

  it('assigns 3 items to 1 group all index 0', () => {
    const items = ['a', 'b', 'c'].map((id) => ({ id }));
    const result = roundRobinAssign(items, 1);
    expect(result.map((r) => r.groupIndex)).toEqual([0, 0, 0]);
  });

  it('returns empty array for 0 items', () => {
    const result = roundRobinAssign([], 3);
    expect(result).toEqual([]);
  });

  it('throws when groupCount is 0', () => {
    expect(() => roundRobinAssign([{ id: 'a' }], 0)).toThrow(
      'groupCount must be > 0',
    );
  });

  it('throws when groupCount is negative', () => {
    expect(() => roundRobinAssign([{ id: 'a' }], -1)).toThrow(
      'groupCount must be > 0',
    );
  });

  it('preserves item ids in output', () => {
    const items = [{ id: 'x1' }, { id: 'x2' }];
    const result = roundRobinAssign(items, 2);
    expect(result[0]).toEqual({ id: 'x1', groupIndex: 0 });
    expect(result[1]).toEqual({ id: 'x2', groupIndex: 1 });
  });
});
