import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

type Listener = (...args: unknown[]) => void;

function makeFakeSocket() {
  const listeners = new Map<string, Listener[]>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const socket = {
    connected: true,
    on: vi.fn((event: string, cb: Listener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    off: vi.fn((event: string, cb: Listener) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(
        event,
        existing.filter((l) => l !== cb),
      );
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitted.push({ event, args });
    }),
    disconnect: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
    _emitted: emitted,
  };
  return socket;
}

let fakeSocket: ReturnType<typeof makeFakeSocket>;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

import { useJudgeSocket } from './use-judge-socket';
import type { VoteSubmittedPayload } from '@competition-platform/shared';

interface HookOptions {
  token?: string;
  judgeSessionId?: string;
  competitionId?: string;
  onCompetitionStarted?: ReturnType<typeof vi.fn>;
  onScoreSubmitted?: ReturnType<typeof vi.fn>;
  onVoteSubmitted?: ReturnType<typeof vi.fn>;
  onStatusChange?: ReturnType<typeof vi.fn>;
}

function buildHook(options: HookOptions = {}) {
  const {
    token = 'tok-1',
    judgeSessionId = 'js-1',
    competitionId = 'comp-1',
    onCompetitionStarted = vi.fn(),
    onScoreSubmitted = vi.fn(),
    onVoteSubmitted = vi.fn(),
    onStatusChange = vi.fn(),
  } = options;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const opts = {
    token,
    judgeSessionId,
    competitionId,
    onCompetitionStarted,
    onScoreSubmitted,
    onVoteSubmitted,
    onStatusChange,
  };

  const HookWrapper: FC = () => {
    useJudgeSocket(opts);
    return null;
  };

  const root = createRoot(container);

  return {
    opts,
    async mount() {
      await act(async () => {
        root.render(createElement(HookWrapper, null));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useJudgeSocket', () => {
  beforeEach(() => {
    fakeSocket = makeFakeSocket();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits join.judge on connect with the configured session/competition', async () => {
    const hook = buildHook();
    await hook.mount();
    await act(async () => {
      fakeSocket._trigger('connect');
    });
    const join = fakeSocket._emitted.find((e) => e.event === 'join.judge');
    expect(join).toBeDefined();
    expect(join?.args[0]).toEqual({
      competitionId: 'comp-1',
      sessionId: 'js-1',
    });
    hook.unmount();
  });

  it('forwards score.submitted events to the onScoreSubmitted callback', async () => {
    const onScoreSubmitted = vi.fn();
    const hook = buildHook({ onScoreSubmitted });
    await hook.mount();
    await act(async () => {
      fakeSocket._trigger('score.submitted', { foo: 'bar' });
    });
    expect(onScoreSubmitted).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('forwards vote.submitted events to the onVoteSubmitted callback (Story 5.2)', async () => {
    const onVoteSubmitted = vi.fn();
    const hook = buildHook({ onVoteSubmitted });
    await hook.mount();
    const payload: VoteSubmittedPayload = {
      competitionId: 'comp-1',
      matchupId: 'm-1',
      judgeSessionId: 'js-1',
      vote: 'player2',
      idempotencyKey: 'k-1',
      submittedAt: '2026-05-04T15:00:00.000Z',
    };
    await act(async () => {
      fakeSocket._trigger('vote.submitted', payload);
    });
    expect(onVoteSubmitted).toHaveBeenCalledWith(payload);
    hook.unmount();
  });

  it('reports disconnected status on disconnect', async () => {
    const onStatusChange = vi.fn();
    const hook = buildHook({ onStatusChange });
    await hook.mount();
    await act(async () => {
      fakeSocket._trigger('disconnect');
    });
    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
    hook.unmount();
  });

  it('disconnects the socket on unmount', async () => {
    const hook = buildHook();
    await hook.mount();
    hook.unmount();
    expect(fakeSocket.disconnect).toHaveBeenCalledOnce();
  });
});
