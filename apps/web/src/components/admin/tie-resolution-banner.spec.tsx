import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { getBracketMock, resolveTieMutationMock, invalidateMock } = vi.hoisted(() => {
  const invalidate = vi.fn();
  return {
    getBracketMock: vi.fn(),
    resolveTieMutationMock: vi.fn(),
    invalidateMock: invalidate,
  };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tournament: {
      getBracket: { useQuery: getBracketMock },
      resolveTie: { useMutation: resolveTieMutationMock },
    },
    useUtils: () => ({
      tournament: {
        getBracket: { invalidate: invalidateMock },
      },
    }),
  },
}));

import { TieResolutionBanner } from './tie-resolution-banner';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function renderBanner(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(TieResolutionBanner, { competitionId: 'comp_1' }));
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

const PENDING_MATCHUP = {
  id: 'm_1',
  roundNumber: 1,
  bracketPosition: 0,
  competitorAId: 'c_a',
  competitorBId: 'c_b',
  seedA: 1,
  seedB: 2,
  isBye: false,
  winnerCompetitorId: null,
  tieStatus: 'organizer_decision_pending',
  revoteCount: 0,
  organizerDecisionReason: null,
  organizerDecisionBy: null,
  completedAt: null,
  competitorA: { name: 'Alice', participantId: 'P-A' },
  competitorB: { name: 'Bob', participantId: 'P-B' },
};

describe('TieResolutionBanner', () => {
  beforeEach(() => {
    getBracketMock.mockReset();
    resolveTieMutationMock.mockReset();
    invalidateMock.mockReset();
    resolveTieMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    });
  });

  it('renders nothing when no pending tie matchups exist', async () => {
    getBracketMock.mockReturnValue({ data: { matchups: [] } });
    const { container, unmount } = await renderBanner();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders nothing when matchups exist but none are tieStatus pending', async () => {
    getBracketMock.mockReturnValue({
      data: {
        matchups: [{ ...PENDING_MATCHUP, tieStatus: null }],
      },
    });
    const { container, unmount } = await renderBanner();
    expect(container.textContent).toBe('');
    unmount();
  });

  it('renders one banner per pending matchup', async () => {
    getBracketMock.mockReturnValue({
      data: {
        matchups: [PENDING_MATCHUP, { ...PENDING_MATCHUP, id: 'm_2', bracketPosition: 1 }],
      },
    });
    const { container, unmount } = await renderBanner();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Match 1');
    expect(container.textContent).toContain('Match 2');
    unmount();
  });

  it('disables submit button when reason is shorter than 4 characters', async () => {
    getBracketMock.mockReturnValue({ data: { matchups: [PENDING_MATCHUP] } });
    const { container, unmount } = await renderBanner();
    const button = container.querySelector(
      'button:not([type="button"][class*="rounded border"])',
    ) as HTMLButtonElement | null;
    // Confirm winner button is the only non-selector button; should be disabled.
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm winner'),
    ) as HTMLButtonElement | undefined;
    expect(submitBtn).toBeDefined();
    expect(submitBtn?.disabled).toBe(true);
    expect(button).toBeDefined();
    unmount();
  });

  it('calls resolveTie mutation with trimmed reason and selected winner', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ success: true });
    resolveTieMutationMock.mockReturnValue({ mutateAsync, isPending: false });
    getBracketMock.mockReturnValue({ data: { matchups: [PENDING_MATCHUP] } });

    const { container, unmount } = await renderBanner();

    // Click Alice (competitor A)
    const aliceBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Alice'),
    ) as HTMLButtonElement;
    await act(async () => {
      aliceBtn.click();
    });

    // Set reason via textarea — React tracks internal value, so use the
    // prototype setter to bypass it and then dispatch the input event.
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      nativeSetter.call(textarea, '   cleaner footwork   ');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm winner'),
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      submitBtn.click();
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      competitionId: 'comp_1',
      matchupId: 'm_1',
      winnerCompetitorId: 'c_a',
      reason: 'cleaner footwork',
    });
    unmount();
  });
});
