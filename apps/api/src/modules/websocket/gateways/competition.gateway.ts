import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Server, Socket } from 'socket.io';
import { judgeSessions, competitions } from '@competition-platform/db';
import type {
  BracketGeneratedPayload,
  CompetitionStartedPayload,
  PhaseTransitionedPayload,
  ScoreSubmittedPayload,
  ScoreOverriddenPayload,
  VoteSubmittedPayload,
  CompetitorWithdrawnPayload,
  CompetitorRescuedPayload,
  StandingsEntry,
  JudgeLiveStatus,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@competition-platform/shared';
import type { ICompetitionGateway } from '../competition-gateway.interface';
import { DatabaseService } from '../../database/database.service';
import { verifyClerkJwt } from '../../auth/clerk-jwt';

type Role = 'judge' | 'anonymous' | 'organizer';
interface CompetitionSocketData {
  role: Role;
  judgeSessionId?: string;
  competitionId?: string;
  organizerClerkId?: string;
}
type CompetitionSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  CompetitionSocketData
>;

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/competition',
})
export class CompetitionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, ICompetitionGateway
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(CompetitionGateway.name);

  // In-memory presence map: competitionId → judgeSessionId → status.
  // MVP: single-instance only. Post-MVP: move to Redis TTL hash.
  private readonly judgePresence = new Map<
    string,
    Map<string, JudgeLiveStatus>
  >();

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async handleConnection(client: CompetitionSocket): Promise<void> {
    // Authenticate at handshake time. NestJS @UseGuards does NOT intercept
    // the WebSocket upgrade — guards only fire on @SubscribeMessage handlers.
    // Validating here is the only way to keep unauthenticated sockets from
    // sitting on the namespace and consuming broadcasts.

    // 1. Check for organizer Clerk JWT (admin clients).
    const clerkToken =
      (client.handshake.auth['clerkToken'] as string | undefined) ??
      (client.handshake.query['clerkToken'] as string | undefined);

    if (typeof clerkToken === 'string' && clerkToken.length > 0) {
      const result = await verifyClerkJwt(clerkToken);
      if (!result) {
        this.logger.warn(
          `WS organizer auth failed for ${client.id} — invalid JWT`,
        );
        client.disconnect(true);
        return;
      }
      client.data.role = 'organizer';
      client.data.organizerClerkId = result.sub;
      this.logger.log(
        `Client connected: ${client.id} (role=organizer, sub=${result.sub})`,
      );
      return;
    }

    // 2. Check for judge token (judge clients).
    const judgeToken = client.handshake.query['token'];
    if (typeof judgeToken === 'string' && judgeToken.length > 0) {
      try {
        const hash = createHash('sha256').update(judgeToken).digest('hex');
        const [session] = await this.db.db
          .select({
            id: judgeSessions.id,
            competitionId: judgeSessions.competitionId,
          })
          .from(judgeSessions)
          .where(eq(judgeSessions.tokenHash, hash));
        if (!session) {
          client.disconnect(true);
          return;
        }
        client.data.role = 'judge';
        client.data.judgeSessionId = session.id;
        client.data.competitionId = session.competitionId;
      } catch (err) {
        this.logger.warn(`WS auth DB error on connect: ${String(err)}`);
        client.disconnect(true);
        return;
      }
    } else {
      client.data.role = 'anonymous';
    }
    this.logger.log(
      `Client connected: ${client.id} (role=${client.data.role})`,
    );
  }

  handleDisconnect(client: CompetitionSocket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    // On judge disconnect: mark as disconnected in presence map. Keep the
    // entry so the dashboard sees disconnected judges (AC #2).
    if (
      client.data.role === 'judge' &&
      client.data.judgeSessionId &&
      client.data.competitionId
    ) {
      const { competitionId, judgeSessionId } = client.data;
      const compMap = this.judgePresence.get(competitionId);
      const existing = compMap?.get(judgeSessionId);
      if (existing) {
        const updated: JudgeLiveStatus = {
          ...existing,
          connected: false,
          lastSeenAt: new Date().toISOString(),
        };
        compMap!.set(judgeSessionId, updated);
        this.broadcastJudgeStatusChanged(competitionId, updated);
      }
    }
  }

  @SubscribeMessage('join.judge')
  async handleJudgeJoin(
    @MessageBody() data: { competitionId: string; sessionId: string },
    @ConnectedSocket() client: CompetitionSocket,
  ): Promise<void> {
    // Judges may only join their own private room, for their own competition.
    if (
      client.data.role !== 'judge' ||
      client.data.judgeSessionId !== data.sessionId ||
      client.data.competitionId !== data.competitionId
    ) {
      this.logger.warn(
        `Rejected join.judge — role=${client.data.role}, authSession=${String(client.data.judgeSessionId)} vs requested=${data.sessionId}`,
      );
      return;
    }

    // Fetch label + groupIndex for the presence entry.
    let label = data.sessionId;
    let groupIndex: number | null = null;
    try {
      const [session] = await this.db.db
        .select({
          label: judgeSessions.label,
          groupIndex: judgeSessions.groupIndex,
        })
        .from(judgeSessions)
        .where(eq(judgeSessions.id, data.sessionId));
      if (session) {
        label = session.label;
        groupIndex = session.groupIndex ?? null;
      }
    } catch {
      // Non-critical — presence entry still created with defaults.
    }

    // Insert/update presence entry with connected=true.
    let compMap = this.judgePresence.get(data.competitionId);
    if (!compMap) {
      compMap = new Map<string, JudgeLiveStatus>();
      this.judgePresence.set(data.competitionId, compMap);
    }
    const existing = compMap.get(data.sessionId);
    const entry: JudgeLiveStatus = {
      judgeSessionId: data.sessionId,
      label,
      groupIndex,
      connected: true,
      queueSize: existing?.queueSize ?? 0,
      lastSeenAt: new Date().toISOString(),
    };
    compMap.set(data.sessionId, entry);
    this.broadcastJudgeStatusChanged(data.competitionId, entry);

    const room = `competition:${data.competitionId}:judge:${data.sessionId}`;
    await client.join(room);
    this.logger.log(`Judge ${data.sessionId} joined room: ${room}`);
  }

  @SubscribeMessage('join.admin')
  async handleAdminJoin(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: CompetitionSocket,
  ): Promise<void> {
    // Reject non-organizer clients. Emit an `error` event so the dashboard
    // can show a diagnostic instead of sitting in a "connected but silent"
    // state — the Socket.IO connect succeeds at handshake even if the room
    // join is refused later.
    if (client.data.role !== 'organizer') {
      this.logger.warn(
        `Rejected join.admin from ${client.id} (role=${client.data.role})`,
      );
      client.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Organizer authentication required to join admin room',
      });
      return;
    }

    const organizerClerkId = client.data.organizerClerkId;
    if (!organizerClerkId) {
      // Internal invariant violation — role was set to organizer without a
      // clerk id. Hard-disconnect rather than continue with corrupt state.
      client.emit('error', {
        code: 'UNAUTHORIZED',
        message: 'Authentication state missing',
      });
      client.disconnect(true);
      return;
    }

    // Verify the organizer owns the requested competition. RLS does NOT apply
    // to in-memory room joins; explicit ownership check is mandatory.
    try {
      const [comp] = await this.db.db
        .select({ id: competitions.id })
        .from(competitions)
        .where(
          and(
            eq(competitions.id, data.competitionId),
            eq(competitions.organizerClerkId, organizerClerkId),
          ),
        );
      if (!comp) {
        this.logger.warn(
          `Rejected join.admin — competition ${data.competitionId} not found for organizer ${organizerClerkId}`,
        );
        client.emit('error', {
          code: 'NOT_FOUND',
          message: 'Competition not found or you do not have access',
        });
        return;
      }
    } catch (err) {
      this.logger.warn(`WS admin join DB error: ${String(err)}`);
      client.emit('error', {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Server error while verifying access',
      });
      return;
    }

    const adminRoom = `competition:${data.competitionId}:admin`;
    await client.join(adminRoom);
    this.logger.log(
      `Organizer ${organizerClerkId} joined admin room for ${data.competitionId}`,
    );
  }

  @SubscribeMessage('join.public')
  async handlePublicJoin(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: CompetitionSocket,
  ): Promise<void> {
    // Public rooms are spectator-only and carry no per-judge data.
    if (
      typeof data.competitionId !== 'string' ||
      data.competitionId.length === 0
    ) {
      return;
    }
    const room = `competition:${data.competitionId}:public`;
    await client.join(room);
    this.logger.log(`Public client joined room: ${room}`);
  }

  @SubscribeMessage('judge.status')
  handleJudgeStatus(
    @MessageBody()
    data: { competitionId: string; sessionId: string; queueSize: number },
    @ConnectedSocket() client: CompetitionSocket,
  ): void {
    // Runtime guard against malformed payloads. The TS type is only a
    // compile-time contract — at the WS trust boundary a malicious or buggy
    // client can send anything. Caps queueSize at MAX_QUEUE_SIZE to prevent
    // UI overflow on the dashboard via crafted values.
    const MAX_QUEUE_SIZE = 10_000;
    if (
      typeof data?.competitionId !== 'string' ||
      typeof data?.sessionId !== 'string' ||
      !Number.isInteger(data?.queueSize) ||
      data.queueSize < 0 ||
      data.queueSize > MAX_QUEUE_SIZE
    ) {
      this.logger.warn(
        `Rejected judge.status — malformed payload from ${client.id}`,
      );
      return;
    }

    // Auth boundary: only the judge that owns this session may emit status.
    if (
      client.data.role !== 'judge' ||
      client.data.judgeSessionId !== data.sessionId ||
      client.data.competitionId !== data.competitionId
    ) {
      this.logger.warn(
        `Rejected judge.status — role=${client.data.role}, authSession=${String(client.data.judgeSessionId)} vs requested=${data.sessionId}`,
      );
      return;
    }

    const compMap = this.judgePresence.get(data.competitionId);
    const existing = compMap?.get(data.sessionId);
    if (!existing) {
      // No-op: judge hasn't completed join.judge yet; status will be set on join.
      return;
    }

    const updated: JudgeLiveStatus = {
      ...existing,
      queueSize: data.queueSize,
      lastSeenAt: new Date().toISOString(),
    };
    compMap!.set(data.sessionId, updated);
    this.broadcastJudgeStatusChanged(data.competitionId, updated);
  }

  // ─── Presence accessors ─────────────────────────────────────────────────────

  getJudgePresence(competitionId: string): JudgeLiveStatus[] {
    const compMap = this.judgePresence.get(competitionId);
    if (!compMap) return [];
    return Array.from(compMap.values());
  }

  clearPresence(competitionId: string): void {
    this.judgePresence.delete(competitionId);
    this.logger.log(`Cleared presence map for competition ${competitionId}`);
  }

  // ─── Broadcast helpers ───────────────────────────────────────────────────────

  broadcastCompetitionStarted(
    competitionId: string,
    payload: CompetitionStartedPayload,
  ): void {
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server
      .to(adminRoom)
      .to(publicRoom)
      .emit('competition.started', payload);
    this.logger.log(`Broadcast competition.started for ${competitionId}`);
  }

  broadcastScoreSubmitted(
    competitionId: string,
    payload: ScoreSubmittedPayload,
  ): void {
    // Admin room only. The payload contains judgeSessionId and per-criterion
    // scores — broadcasting to the public room would leak individual judge
    // scores and violate AC #5 ("no other judges' data are visible").
    // Public-facing aggregated standings are the scope of story 3.4.
    const adminRoom = `competition:${competitionId}:admin`;
    this.server.to(adminRoom).emit('score.submitted', payload);
    this.logger.log(
      `Broadcast score.submitted (admin) for competitor ${payload.competitorId}`,
    );
  }

  broadcastScoreOverridden(
    competitionId: string,
    payload: ScoreOverriddenPayload,
  ): void {
    // Admin room only. Mirrors broadcastScoreSubmitted boundary discipline:
    // override payload identifies a specific (judge, competitor) pair plus the
    // organizer Clerk ID — sensitive. Spectators see the recomputed standings
    // via the separate broadcastStandingsUpdated call.
    const adminRoom = `competition:${competitionId}:admin`;
    this.server.to(adminRoom).emit('score.overridden', payload);
    this.logger.log(
      `Broadcast score.overridden (admin) for score ${payload.scoreId}`,
    );
  }

  broadcastStandingsUpdated(
    competitionId: string,
    standings: StandingsEntry[],
  ): void {
    // Emit to both admin room AND public room. Standings are aggregated
    // per-judge totals — no raw criterion scores, safe for both audiences.
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server
      .to(adminRoom)
      .to(publicRoom)
      .emit('standings.updated', standings);
    this.logger.log(
      `Broadcast standings.updated for ${competitionId} (${standings.length} entries)`,
    );
  }

  broadcastPhaseTransitioned(
    competitionId: string,
    payload: PhaseTransitionedPayload,
  ): void {
    // Admin AND public — organizer dashboard plus spectator standings page
    // both want the cypher-locked signal. Payload contains advanced competitor
    // IDs only, no raw scores; safe for the public room.
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server
      .to(adminRoom)
      .to(publicRoom)
      .emit('phase.transitioned', payload);
    this.logger.log(
      `Broadcast phase.transitioned for ${competitionId} (${payload.fromPhase} → ${payload.toPhase}, ${payload.advancedCompetitorIds.length} advanced)`,
    );
  }

  broadcastBracketGenerated(
    competitionId: string,
    payload: BracketGeneratedPayload,
  ): void {
    // Admin AND public rooms. Admin needs it for the dashboard immediately;
    // public room is forward-compatible for Story 6.2's spectator bracket view.
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server.to(adminRoom).to(publicRoom).emit('bracket.generated', payload);
    this.logger.log(
      `Broadcast bracket.generated for ${competitionId} (size=${payload.bracketSize}, qualifiers=${payload.qualifierCount})`,
    );
  }

  broadcastVoteSubmitted(
    competitionId: string,
    payload: VoteSubmittedPayload,
  ): void {
    // AC #10 mandates broadcast on both `competition:{id}:admin` and every
    // `competition:{id}:judge:{judgeId}` room. Iterate the in-memory presence
    // map (populated on join.judge) and chain `.to(room)` for each known judge.
    const adminRoom = `competition:${competitionId}:admin`;
    let target = this.server.to(adminRoom);
    const judgeMap = this.judgePresence.get(competitionId);
    let judgeRoomCount = 0;
    if (judgeMap) {
      for (const judgeSessionId of judgeMap.keys()) {
        target = target.to(
          `competition:${competitionId}:judge:${judgeSessionId}`,
        );
        judgeRoomCount++;
      }
    }
    target.emit('vote.submitted', payload);
    this.logger.log(
      `Broadcast vote.submitted for ${competitionId} (matchup=${payload.matchupId}, admin + ${judgeRoomCount} judge room(s))`,
    );
  }

  broadcastJudgeStatusChanged(
    competitionId: string,
    status: JudgeLiveStatus,
  ): void {
    // Admin room only. Judge identity (label, session ID) is sensitive —
    // spectators must not see per-judge connection/queue data.
    const adminRoom = `competition:${competitionId}:admin`;
    this.server.to(adminRoom).emit('judge.status-changed', status);
    this.logger.log(
      `Broadcast judge.status-changed for judge ${status.judgeSessionId} in ${competitionId} (connected=${String(status.connected)}, queueSize=${status.queueSize})`,
    );
  }

  broadcastCompetitorWithdrawn(
    competitionId: string,
    payload: CompetitorWithdrawnPayload,
  ): void {
    // Admin AND public rooms — withdrawal affects public standings.
    const adminRoom = `competition:${competitionId}:admin`;
    const publicRoom = `competition:${competitionId}:public`;
    this.server
      .to(adminRoom)
      .to(publicRoom)
      .emit('competitor.withdrawn', payload);
    this.logger.log(
      `Broadcast competitor.withdrawn for ${payload.competitorId} in ${competitionId}`,
    );
  }

  broadcastCompetitorRescued(
    competitionId: string,
    payload: CompetitorRescuedPayload,
  ): void {
    // Admin room only. Rescue is an administrative decision; public standings
    // update arrives separately via broadcastStandingsUpdated.
    const adminRoom = `competition:${competitionId}:admin`;
    this.server.to(adminRoom).emit('competitor.rescued', payload);
    this.logger.log(
      `Broadcast competitor.rescued for ${payload.competitorId} in ${competitionId}`,
    );
  }
}
