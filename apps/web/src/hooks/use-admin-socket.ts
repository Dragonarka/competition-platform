'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ScoreSubmittedPayload,
  ScoreOverriddenPayload,
  CompetitorWithdrawnPayload,
  CompetitorRescuedPayload,
  SimulationResetPayload,
  StandingsEntry,
  JudgeLiveStatus,
  PhaseTransitionedPayload,
  BracketAdvancedPayload,
  BracketGeneratedPayload,
  CompetitionCompletedPayload,
  MatchupCompletedPayload,
  MatchupRevoteRequiredPayload,
  MatchupTieResolutionRequiredPayload,
  VoteSubmittedPayload,
} from '@competition-platform/shared';

type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseAdminSocketOptions {
  competitionId: string;
  clerkToken: string | null;
  onScoreSubmitted?: (p: ScoreSubmittedPayload) => void;
  onScoreOverridden?: (p: ScoreOverriddenPayload) => void;
  onStandingsUpdated?: (s: StandingsEntry[]) => void;
  onJudgeStatusChanged?: (s: JudgeLiveStatus) => void;
  onPhaseTransitioned?: (p: PhaseTransitionedPayload) => void;
  onBracketGenerated?: (p: BracketGeneratedPayload) => void;
  onVoteSubmitted?: (p: VoteSubmittedPayload) => void;
  onMatchupCompleted?: (p: MatchupCompletedPayload) => void;
  onMatchupRevoteRequired?: (p: MatchupRevoteRequiredPayload) => void;
  onMatchupTieResolutionRequired?: (p: MatchupTieResolutionRequiredPayload) => void;
  onBracketAdvanced?: (p: BracketAdvancedPayload) => void;
  onCompetitionCompleted?: (p: CompetitionCompletedPayload) => void;
  onCompetitorWithdrawn?: (p: CompetitorWithdrawnPayload) => void;
  onCompetitorRescued?: (p: CompetitorRescuedPayload) => void;
  onSimulationReset?: (p: SimulationResetPayload) => void;
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  onError?: (err: { code: string; message: string }) => void;
}

export function useAdminSocket(opts: UseAdminSocketOptions) {
  const socketRef = useRef<AdminSocket | null>(null);
  const optsRef = useRef(opts);

  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    // Do not connect if Clerk token is unavailable (logged-out state).
    if (!opts.clerkToken) return;

    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const socket = io(`${apiUrl}/competition`, {
      auth: { clerkToken: opts.clerkToken },
      transports: ['websocket'],
    }) as AdminSocket;

    socket.on('connect', () => {
      optsRef.current.onStatusChange?.('connected');
      socket.emit('join.admin', { competitionId: opts.competitionId });
    });

    socket.on('disconnect', () => {
      optsRef.current.onStatusChange?.('disconnected');
    });

    socket.on('connect_error', () => {
      optsRef.current.onStatusChange?.('reconnecting');
    });

    socket.on('score.submitted', (p) => {
      optsRef.current.onScoreSubmitted?.(p);
    });

    socket.on('score.overridden', (p) => {
      optsRef.current.onScoreOverridden?.(p);
    });

    socket.on('standings.updated', (s) => {
      optsRef.current.onStandingsUpdated?.(s);
    });

    socket.on('judge.status-changed', (s) => {
      optsRef.current.onJudgeStatusChanged?.(s);
    });

    socket.on('phase.transitioned', (p) => {
      optsRef.current.onPhaseTransitioned?.(p);
    });

    socket.on('bracket.generated', (p) => {
      optsRef.current.onBracketGenerated?.(p);
    });

    socket.on('vote.submitted', (p) => {
      optsRef.current.onVoteSubmitted?.(p);
    });

    socket.on('matchup.completed', (p) => {
      optsRef.current.onMatchupCompleted?.(p);
    });

    socket.on('matchup.revote-required', (p) => {
      optsRef.current.onMatchupRevoteRequired?.(p);
    });

    socket.on('matchup.tie-resolution-required', (p) => {
      optsRef.current.onMatchupTieResolutionRequired?.(p);
    });

    socket.on('bracket.advanced', (p) => {
      optsRef.current.onBracketAdvanced?.(p);
    });

    socket.on('competition.completed', (p) => {
      optsRef.current.onCompetitionCompleted?.(p);
    });

    socket.on('competitor.withdrawn', (p) => {
      optsRef.current.onCompetitorWithdrawn?.(p);
    });

    socket.on('competitor.rescued', (p) => {
      optsRef.current.onCompetitorRescued?.(p);
    });

    socket.on('simulation.reset', (p) => {
      optsRef.current.onSimulationReset?.(p);
    });

    socket.on('error', (err) => {
      optsRef.current.onError?.(err);
    });

    const handleOffline = () => optsRef.current.onStatusChange?.('disconnected');
    window.addEventListener('offline', handleOffline);

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      window.removeEventListener('offline', handleOffline);
      socketRef.current = null;
    };
    // Reconnect with a new token if auth state changes.
  }, [opts.clerkToken, opts.competitionId]);

  return socketRef;
}
