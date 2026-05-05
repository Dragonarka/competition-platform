import { create } from 'zustand';

type SubmissionStatus = 'idle' | 'sending' | 'confirmed' | 'error' | 'queued';
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface ScoringState {
  submissionStatus: SubmissionStatus;
  connectionStatus: ConnectionStatus;
  setSubmissionStatus: (status: SubmissionStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useScoringStore = create<ScoringState>((set) => ({
  submissionStatus: 'idle',
  connectionStatus: 'disconnected',
  setSubmissionStatus: (submissionStatus) => set({ submissionStatus }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
