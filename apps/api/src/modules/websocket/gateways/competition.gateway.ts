import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Server, Socket } from 'socket.io';
import { judgeSessions } from '@competition-platform/db';
import type {
  CompetitionStartedPayload,
  ScoreSubmittedPayload,
  StandingsEntry,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@competition-platform/shared';
import type { ICompetitionGateway } from '../competition-gateway.interface';
import { DatabaseService } from '../../database/database.service';

type Role = 'judge' | 'anonymous';
interface CompetitionSocketData {
  role: Role;
  judgeSessionId?: string;
  competitionId?: string;
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

  constructor(private readonly db: DatabaseService) {}

  async handleConnection(client: CompetitionSocket): Promise<void> {
    // Authenticate at handshake time. NestJS @UseGuards does NOT intercept
    // the WebSocket upgrade — guards only fire on @SubscribeMessage handlers.
    // Validating here is the only way to keep unauthenticated sockets from
    // sitting on the namespace and consuming broadcasts.
    const token = client.handshake.query['token'];
    if (typeof token === 'string' && token.length > 0) {
      try {
        const hash = createHash('sha256').update(token).digest('hex');
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
    const room = `competition:${data.competitionId}:judge:${data.sessionId}`;
    await client.join(room);
    this.logger.log(`Judge ${data.sessionId} joined room: ${room}`);
  }

  @SubscribeMessage('join.admin')
  handleAdminJoin(
    @MessageBody() _data: { competitionId: string },
    @ConnectedSocket() client: CompetitionSocket,
  ): void {
    // Admin rooms require organizer credentials. Organizer WS auth is not yet
    // wired up — reject all join.admin attempts until that lands (story 4.1).
    this.logger.warn(
      `Rejected join.admin from ${client.id} (role=${client.data.role}) — organizer WS auth not implemented`,
    );
  }

  @SubscribeMessage('join.public')
  async handlePublicJoin(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: CompetitionSocket,
  ): Promise<void> {
    // Public rooms are spectator-only and carry no per-judge data (H3 fix).
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

  broadcastStandingsUpdated(
    competitionId: string,
    standings: StandingsEntry[],
  ): void {
    // Public room only — emits aggregated per-judge totals, not raw criterion scores.
    const publicRoom = `competition:${competitionId}:public`;
    this.server.to(publicRoom).emit('standings.updated', standings);
    this.logger.log(
      `Broadcast standings.updated for ${competitionId} (${standings.length} entries)`,
    );
  }
}
