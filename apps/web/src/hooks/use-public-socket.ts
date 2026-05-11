'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  BracketAdvancedPayload,
  CompetitionCompletedPayload,
  MatchupCompletedPayload,
  PhaseTransitionedPayload,
  SimulationResetPayload,
  StandingsEntry,
} from '@competition-platform/shared';

type PublicSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UsePublicSocketOptions {
  competitionId: string;
  onStandingsUpdated?: (standings: StandingsEntry[]) => void;
  onPhaseTransitioned?: (payload: PhaseTransitionedPayload) => void;
  onMatchupCompleted?: (payload: MatchupCompletedPayload) => void;
  onBracketAdvanced?: (payload: BracketAdvancedPayload) => void;
  onCompetitionCompleted?: (payload: CompetitionCompletedPayload) => void;
  onSimulationReset?: (payload: SimulationResetPayload) => void;
}

export function usePublicSocket({
  competitionId,
  onStandingsUpdated,
  onPhaseTransitioned,
  onMatchupCompleted,
  onBracketAdvanced,
  onCompetitionCompleted,
  onSimulationReset,
}: UsePublicSocketOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const standingsCallbackRef = useRef(onStandingsUpdated);
  const phaseCallbackRef = useRef(onPhaseTransitioned);
  const matchupCompletedRef = useRef(onMatchupCompleted);
  const bracketAdvancedRef = useRef(onBracketAdvanced);
  const competitionCompletedRef = useRef(onCompetitionCompleted);
  const simulationResetRef = useRef(onSimulationReset);
  useEffect(() => {
    standingsCallbackRef.current = onStandingsUpdated;
    phaseCallbackRef.current = onPhaseTransitioned;
    matchupCompletedRef.current = onMatchupCompleted;
    bracketAdvancedRef.current = onBracketAdvanced;
    competitionCompletedRef.current = onCompetitionCompleted;
    simulationResetRef.current = onSimulationReset;
  });

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const socket = io(`${apiUrl}/competition`, {
      transports: ['websocket'],
    }) as PublicSocket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join.public', { competitionId });
    });

    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('reconnecting'));

    socket.on('standings.updated', (standings) => {
      standingsCallbackRef.current?.(standings);
    });

    socket.on('phase.transitioned', (payload) => {
      phaseCallbackRef.current?.(payload);
    });

    socket.on('matchup.completed', (payload) => {
      matchupCompletedRef.current?.(payload);
    });

    socket.on('bracket.advanced', (payload) => {
      bracketAdvancedRef.current?.(payload);
    });

    socket.on('competition.completed', (payload) => {
      competitionCompletedRef.current?.(payload);
    });

    socket.on('simulation.reset', (payload) => {
      simulationResetRef.current?.(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [competitionId]);

  return { connectionStatus };
}
