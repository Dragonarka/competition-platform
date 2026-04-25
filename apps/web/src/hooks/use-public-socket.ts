'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  StandingsEntry,
} from '@competition-platform/shared';

type PublicSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UsePublicSocketOptions {
  competitionId: string;
  onStandingsUpdated?: (standings: StandingsEntry[]) => void;
}

export function usePublicSocket({ competitionId, onStandingsUpdated }: UsePublicSocketOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const callbackRef = useRef(onStandingsUpdated);
  // Keep ref current on every render without adding callback to socket effect deps.
  useEffect(() => {
    callbackRef.current = onStandingsUpdated;
  });

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    // No token — anonymous public connection. Gateway assigns role: 'anonymous'.
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
      callbackRef.current?.(standings);
    });

    return () => {
      socket.disconnect();
    };
  }, [competitionId]);

  return { connectionStatus };
}
