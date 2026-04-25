'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GeneratedLink {
  id: string;
  label: string;
  token: string;
  url: string;
}

export function JudgeLinksManager({ competitionId }: { competitionId: string }) {
  const { data: links, isLoading } = trpc.tournament.listJudgeLinks.useQuery({ competitionId });
  const utils = trpc.useUtils();
  const [count, setCount] = useState<number | ''>(3);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateMutation = trpc.tournament.generateJudgeLinks.useMutation({
    onSuccess: (data) => {
      const base = window.location.origin;
      setGeneratedLinks(
        data.map((l) => ({
          id: l.id,
          label: l.label,
          token: l.token,
          url: `${base}/judge/${l.token}`,
        })),
      );
      utils.tournament.listJudgeLinks.invalidate({ competitionId });
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const revokeMutation = trpc.tournament.revokeJudgeLink.useMutation({
    onSuccess: () => utils.tournament.listJudgeLinks.invalidate({ competitionId }),
    onError: (err) => setError(err.message),
  });

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => setError('Failed to copy to clipboard'));
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof count !== 'number' || count < 1) return;
    setGeneratedLinks(null);
    setError(null);
    generateMutation.mutate({ competitionId, count });
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading judge links...</p>;

  return (
    <div className="space-y-6">
      {generatedLinks && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base text-primary">
              New Links Generated — Save These Now
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These links can only be seen once. Copy them before leaving this page.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {generatedLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2">
                <span className="text-sm font-medium w-20 shrink-0">{link.label}</span>
                <code className="flex-1 text-xs bg-muted px-2 py-1 rounded truncate">
                  {link.url}
                </code>
                <Button size="sm" variant="outline" onClick={() => handleCopy(link.id, link.url)}>
                  {copiedId === link.id ? 'Copied' : 'Copy'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate New Judge Links</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="linkCount">Number of Links</Label>
              <Input
                id="linkCount"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setCount(isNaN(v) ? '' : v);
                }}
                className="w-24"
                disabled={generateMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={generateMutation.isPending || typeof count !== 'number'}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Links'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Judge Links ({links?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!links?.length ? (
            <p className="text-sm text-muted-foreground">No judge links generated yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between py-1.5 border-b last:border-0"
                >
                  <span className="text-sm font-medium">{link.label}</span>
                  <span className="text-xs text-muted-foreground mr-auto ml-3">
                    Created {new Date(link.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => revokeMutation.mutate({ judgeSessionId: link.id })}
                    disabled={revokeMutation.isPending}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
