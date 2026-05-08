import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BreakdownPanel } from './breakdown-panel';
import type { CriterionBreakdownPublic, GroupBreakdownPublic } from '@competition-platform/shared';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(props: Parameters<typeof BreakdownPanel>[0]): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(BreakdownPanel, props));
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const CRITERIA: CriterionBreakdownPublic[] = [
  { criterionId: 'c1', criterionName: 'Foundations', total: '8.50', judgeCount: 1 },
  { criterionId: 'c2', criterionName: 'Musicality', total: '7.75', judgeCount: 1 },
];

const GROUPS: GroupBreakdownPublic[] = [
  { groupIndex: 0, groupLabel: 'Group A', total: '15.00', judgeCount: 2 },
  { groupIndex: 1, groupLabel: 'Group B', total: '14.50', judgeCount: 2 },
];

describe('BreakdownPanel', () => {
  it('renders nothing when both breakdowns are absent', async () => {
    const { container, unmount } = await render({});
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders nothing when both breakdowns are empty arrays', async () => {
    const { container, unmount } = await render({
      criteriaBreakdown: [],
      groupBreakdown: [],
    });
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders only the criteria section when groupBreakdown is missing', async () => {
    const { container, unmount } = await render({ criteriaBreakdown: CRITERIA });
    expect(container.querySelector('[data-testid="breakdown-criteria"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="breakdown-groups"]')).toBeNull();
    expect(container.textContent).toContain('Foundations');
    expect(container.textContent).toContain('8.50');
    expect(container.textContent).toContain('Musicality');
    unmount();
  });

  it('renders only the groups section when criteriaBreakdown is missing', async () => {
    const { container, unmount } = await render({ groupBreakdown: GROUPS });
    expect(container.querySelector('[data-testid="breakdown-criteria"]')).toBeNull();
    expect(container.querySelector('[data-testid="breakdown-groups"]')).not.toBeNull();
    expect(container.textContent).toContain('Group A');
    expect(container.textContent).toContain('15.00');
    unmount();
  });

  it('renders both sections with judge counts when both are provided', async () => {
    const { container, unmount } = await render({
      criteriaBreakdown: CRITERIA,
      groupBreakdown: GROUPS,
    });
    expect(container.querySelector('[data-testid="breakdown-criteria"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="breakdown-groups"]')).not.toBeNull();
    expect(container.textContent).toContain('×1');
    expect(container.textContent).toContain('×2');
    unmount();
  });
});
