'use client';

import Papa, { type ParseError } from 'papaparse';
import { Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

const MAX_INDIVIDUAL = 200;
const MAX_PAIRS = 100;
const INDIVIDUAL_COLUMNS = ['participantId', 'name'] as const;
const PAIR_COLUMNS = ['pairId', 'leaderId', 'leaderName', 'followerId', 'followerName'] as const;

interface IndividualRow {
  kind: 'individual';
  index: number;
  participantId: string;
  name: string;
  errors: string[];
}

interface PairRow {
  kind: 'pair';
  index: number;
  pairId: string;
  leader: { participantId: string; name: string };
  follower: { participantId: string; name: string };
  errors: string[];
}

type Row = IndividualRow | PairRow;

interface ParticipantsCsvImportProps {
  competitionId: string;
  format: 'individual' | 'pairs';
  existingIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}

export function ParticipantsCsvImport({
  competitionId,
  format,
  existingIds,
  onClose,
  onSuccess,
}: ParticipantsCsvImportProps) {
  const t = useTranslations('Participants');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkIndividual = trpc.tournament.bulkAddParticipants.useMutation();
  const bulkPairs = trpc.tournament.bulkAddPairs.useMutation();
  const utils = trpc.useUtils();

  function reset() {
    setRows(null);
    setParseError(null);
    setBatchError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFile(file: File) {
    setParseError(null);
    setBatchError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        if (result.errors.length > 0) {
          setParseError(formatPapaErrors(result.errors));
          return;
        }
        const data = result.data;
        if (data.length === 0) {
          setParseError(t('csvNoRows'));
          return;
        }

        const required = format === 'pairs' ? PAIR_COLUMNS : INDIVIDUAL_COLUMNS;
        const headers = result.meta.fields ?? [];
        const missing = required.filter((c) => !headers.includes(c));
        if (missing.length > 0) {
          setParseError(t('csvMissingColumns', { columns: missing.join(', ') }));
          return;
        }

        const max = format === 'pairs' ? MAX_PAIRS : MAX_INDIVIDUAL;
        const expectedRows = format === 'pairs' ? data.length : data.length;
        if (expectedRows > max) {
          setParseError(t('csvTooManyRows', { max }));
          return;
        }

        const parsed =
          format === 'pairs'
            ? buildPairRows(data, existingIds)
            : buildIndividualRows(data, existingIds);
        setRows(parsed);
      },
      error: (err) => setParseError(t('csvParseError', { message: err.message })),
    });
  }

  async function handleConfirm() {
    if (!rows) return;
    const validRows = rows.filter((r) => r.errors.length === 0);
    setBatchError(null);
    try {
      if (format === 'pairs') {
        await bulkPairs.mutateAsync({
          competitionId,
          pairs: (validRows as PairRow[]).map((r) => ({
            leader: r.leader,
            follower: r.follower,
          })),
        });
      } else {
        await bulkIndividual.mutateAsync({
          competitionId,
          rows: (validRows as IndividualRow[]).map((r) => ({
            participantId: r.participantId,
            name: r.name,
          })),
        });
      }
      await utils.tournament.listParticipants.invalidate({ competitionId });
      onSuccess();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : String(err));
    }
  }

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = rows?.filter((r) => r.errors.length > 0).length ?? 0;
  const isPending = bulkIndividual.isPending || bulkPairs.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">{t('csvDialogTitle')}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="close">
            <X />
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {format === 'pairs' ? t('csvPairsHint') : t('csvIndividualHint')}
        </p>

        {!rows && (
          <label
            className={cn(
              'flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/40',
            )}
          >
            <Upload className="size-5" />
            <span>{t('csvDropFile')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        )}

        {parseError && <p className="mt-3 text-sm text-destructive">{parseError}</p>}

        {rows && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">
              {t('csvPreviewTitle', { valid: validCount, invalid: invalidCount })}
            </p>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    {format === 'pairs' ? (
                      <>
                        <th className="px-3 py-2 text-left">{t('pairLeader')}</th>
                        <th className="px-3 py-2 text-left">{t('pairFollower')}</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-left">{t('participantIdLabel')}</th>
                        <th className="px-3 py-2 text-left">{t('nameLabel')}</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.index} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{r.index + 1}</td>
                      {r.kind === 'pair' ? (
                        <>
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.leader.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.leader.participantId}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.follower.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.follower.participantId}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{r.participantId}</td>
                          <td className="px-3 py-2">{r.name}</td>
                        </>
                      )}
                      <td className="px-3 py-2">
                        {r.errors.length === 0 ? (
                          <StatusBadge variant="success">OK</StatusBadge>
                        ) : (
                          <StatusBadge variant="danger" title={r.errors.join('; ')}>
                            {r.errors[0]}
                          </StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batchError && <p className="text-sm text-destructive">{batchError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={reset} disabled={isPending}>
                {t('csvCancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isPending || validCount === 0 || invalidCount > 0}
              >
                {isPending ? t('csvImporting') : t('csvConfirm', { count: validCount })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPapaErrors(errors: ParseError[]): string {
  return errors
    .slice(0, 3)
    .map((e) => `row ${e.row ?? '?'}: ${e.message}`)
    .join('; ');
}

function buildIndividualRows(
  data: Record<string, string>[],
  existingIds: Set<string>,
): IndividualRow[] {
  const seen = new Set<string>();
  return data.map((raw, index) => {
    const participantId = (raw.participantId ?? '').trim();
    const name = (raw.name ?? '').trim();
    const errors: string[] = [];
    if (!participantId) errors.push('missing participantId');
    if (!name) errors.push('missing name');
    if (participantId && existingIds.has(participantId)) errors.push('already exists');
    if (participantId && seen.has(participantId)) errors.push('duplicate in CSV');
    if (participantId) seen.add(participantId);
    return { kind: 'individual', index, participantId, name, errors };
  });
}

function buildPairRows(data: Record<string, string>[], existingIds: Set<string>): PairRow[] {
  const seen = new Set<string>();
  return data.map((raw, index) => {
    const pairId = (raw.pairId ?? '').trim();
    const leader = {
      participantId: (raw.leaderId ?? '').trim(),
      name: (raw.leaderName ?? '').trim(),
    };
    const follower = {
      participantId: (raw.followerId ?? '').trim(),
      name: (raw.followerName ?? '').trim(),
    };
    const errors: string[] = [];
    if (!pairId) errors.push('missing pairId');
    if (!leader.participantId || !leader.name) errors.push('orphan leader');
    if (!follower.participantId || !follower.name) errors.push('orphan follower');
    if (leader.participantId === follower.participantId && leader.participantId) {
      errors.push('leader = follower');
    }
    for (const pid of [leader.participantId, follower.participantId]) {
      if (pid && existingIds.has(pid)) errors.push(`${pid} already exists`);
      if (pid && seen.has(pid)) errors.push(`${pid} duplicate in CSV`);
      if (pid) seen.add(pid);
    }
    return { kind: 'pair', index, pairId, leader, follower, errors };
  });
}
