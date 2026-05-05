'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  VoteSubmittedPayload,
} from '@competition-platform/shared';

type JudgeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseJudgeSocketOptions {
  token: string;
  judgeSessionId: string;
  competitionId: string;
  onCompetitionStarted?: () => void;
  onScoreSubmitted?: () => void;
  onVoteSubmitted?: (payload: VoteSubmittedPayload) => void;
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

export function useJudgeSocket(opts: UseJudgeSocketOptions) {
  const socketRef = useRef<JudgeSocket | null>(null);
  const optsRef = useRef(opts);

  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const socket = io(`${apiUrl}/competition`, {
      query: { token: opts.token },
      transports: ['websocket'],
    }) as JudgeSocket;

    socket.on('connect', () => {
      optsRef.current.onStatusChange?.('connected');
      if (opts.competitionId && opts.judgeSessionId) {
        socket.emit('join.judge', {
          competitionId: opts.competitionId,
          sessionId: opts.judgeSessionId,
        });
      }
    });

    socket.on('disconnect', () => {
      optsRef.current.onStatusChange?.('disconnected');
    });

    socket.on('connect_error', () => {
      optsRef.current.onStatusChange?.('reconnecting');
    });

    socket.on('competition.started', () => {
      optsRef.current.onCompetitionStarted?.();
    });

    socket.on('score.submitted', () => {
      optsRef.current.onScoreSubmitted?.();
    });

    socket.on('vote.submitted', (p) => {
      optsRef.current.onVoteSubmitted?.(p);
    });

    // When the browser goes offline, Socket.IO will try to reconnect and emit
    // connect_error (→ 'reconnecting'). Force 'disconnected' so the indicator
    // stays red for the duration of the offline period.
    const handleOffline = () => optsRef.current.onStatusChange?.('disconnected');
    window.addEventListener('offline', handleOffline);

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      window.removeEventListener('offline', handleOffline);
    };
  }, [opts.token, opts.competitionId, opts.judgeSessionId]);

  return socketRef;
}
