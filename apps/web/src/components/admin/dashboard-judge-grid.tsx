import { Card, CardContent } from '@/components/ui/card';

interface JudgeEntry {
  judgeSessionId: string;
  label: string;
  groupIndex: number | null;
  connected: boolean;
  queueSize: number;
  lastSeenAt: string | null;
  submittedCount: number;
  expectedCount: number;
}

interface DashboardJudgeGridProps {
  judges: JudgeEntry[];
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function DashboardJudgeGrid({ judges }: DashboardJudgeGridProps) {
  if (judges.length === 0) {
    return <p className="text-sm text-muted-foreground">No judges assigned yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {judges.map((judge) => (
        <Card
          key={judge.judgeSessionId}
          className={`border ${judge.connected ? 'border-green-500/40' : 'border-yellow-500/40'}`}
        >
          <CardContent className="pt-4 pb-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{judge.label}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {judge.queueSize > 0 && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded font-medium">
                    {judge.queueSize} pending
                  </span>
                )}
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    judge.connected ? 'bg-green-500' : 'bg-yellow-400'
                  }`}
                  title={judge.connected ? 'Connected' : 'Disconnected'}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {judge.groupIndex !== null && (
                <span className="bg-muted px-1.5 py-0.5 rounded">Group {judge.groupIndex + 1}</span>
              )}
              <span>
                {judge.submittedCount}/{judge.expectedCount} scored
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last seen: {formatLastSeen(judge.lastSeenAt)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
