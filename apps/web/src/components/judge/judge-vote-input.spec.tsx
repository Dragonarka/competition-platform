import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { JudgeVoteInput } from '@competition-platform/format-cypher-battles';

interface RenderResult {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

async function render(
  props: Partial<React.ComponentProps<typeof JudgeVoteInput>> = {},
): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const merged: React.ComponentProps<typeof JudgeVoteInput> = {
    matchupId: 'm1',
    player1Id: 'a',
    player1Name: 'Alice',
    player1Seed: 1,
    player2Id: 'b',
    player2Name: 'Bob',
    player2Seed: 8,
    onVote: vi.fn(),
    ...props,
  };
  await act(async () => {
    root.render(createElement(JudgeVoteInput, merged));
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

function buttonsByText(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

describe('JudgeVoteInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders both player names plus three vote buttons', async () => {
    const { container, unmount } = await render();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Seed 1');
    expect(container.textContent).toContain('Seed 8');
    expect(buttonsByText(container)).toHaveLength(3);
    unmount();
  });

  it('omits seed labels when seeds are null', async () => {
    const { container, unmount } = await render({
      player1Seed: null,
      player2Seed: null,
    });
    expect(container.textContent).not.toContain('Seed');
    unmount();
  });

  it('invokes onVote with the right choice for each button', async () => {
    const onVote = vi.fn().mockResolvedValue(undefined);
    const { container, unmount } = await render({ onVote });
    const [voteAlice, voteBob, tie] = buttonsByText(container);
    await act(async () => {
      voteAlice!.click();
    });
    await act(async () => {
      voteBob!.click();
    });
    await act(async () => {
      tie!.click();
    });
    expect(onVote.mock.calls.map((c) => c[0])).toEqual(['player1', 'player2', 'tie']);
    unmount();
  });

  it('disables all buttons when disabled=true', async () => {
    const onVote = vi.fn();
    const { container, unmount } = await render({ disabled: true, onVote });
    const buttons = buttonsByText(container);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    await act(async () => {
      buttons[0]!.click();
    });
    expect(onVote).not.toHaveBeenCalled();
    unmount();
  });

  it('locks all buttons mid-submission and shows Submitting... only on the clicked one', async () => {
    let resolveVote: (() => void) | null = null;
    const onVote = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveVote = resolve;
        }),
    );
    const { container, unmount } = await render({ onVote });
    const [voteAlice, voteBob, tie] = buttonsByText(container);

    await act(async () => {
      voteAlice!.click();
    });

    expect(voteAlice!.textContent).toContain('Submitting');
    expect(voteBob!.textContent).not.toContain('Submitting');
    expect(tie!.textContent).not.toContain('Submitting');
    expect(buttonsByText(container).every((b) => b.disabled)).toBe(true);

    await act(async () => {
      resolveVote?.();
    });
    expect(onVote).toHaveBeenCalledTimes(1);
    unmount();
  });
});
