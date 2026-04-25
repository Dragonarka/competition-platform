export function roundRobinAssign<T extends { id: string }>(
  items: T[],
  groupCount: number,
): { id: string; groupIndex: number }[] {
  if (groupCount <= 0) throw new Error('groupCount must be > 0');
  return items.map((item, i) => ({ id: item.id, groupIndex: i % groupCount }));
}
