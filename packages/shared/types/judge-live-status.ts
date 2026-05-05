export interface JudgeLiveStatus {
  judgeSessionId: string;
  label: string;
  groupIndex: number | null;
  connected: boolean;
  queueSize: number;
  lastSeenAt: string | null; // ISO 8601
}
