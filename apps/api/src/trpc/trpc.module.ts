import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { verifyToken } from '@clerk/backend';
import type { Request, Response } from 'express';
import { createAppRouter } from './trpc.router';
import type { TrpcContext } from './trpc.context';
import { DatabaseService } from '../modules/database/database.service';
import { WebsocketModule } from '../modules/websocket/websocket.module';
import { CompetitionGateway } from '../modules/websocket/gateways/competition.gateway';

function extractClientIp(req: Request): string | null {
  // Use the TCP socket's remote address — not spoofable via request headers.
  // x-forwarded-for is client-controlled without explicit `trust proxy` config
  // and must not be used as a rate-limit key in an unproxied deployment.
  // If running behind a trusted reverse proxy, set app.set('trust proxy', 1)
  // so that req.ip reflects the real client IP, then switch to req.ip here.
  return req.socket.remoteAddress ?? null;
}

async function createContext({
  req,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  const clientIp = extractClientIp(req);
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return { userId: null, clientIp };
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return { userId: null, clientIp };
  }
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env['CLERK_SECRET_KEY'] ?? '',
    });
    return { userId: payload.sub, clientIp };
  } catch {
    return { userId: null, clientIp };
  }
}

@Module({
  imports: [WebsocketModule],
})
export class TrpcModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(CompetitionGateway)
    private readonly competitionGateway: CompetitionGateway,
  ) {}

  onModuleInit(): void {
    const appRouter = createAppRouter(
      this.databaseService,
      this.competitionGateway,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const expressApp = this.httpAdapterHost.httpAdapter.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    expressApp.use(
      '/trpc',
      createExpressMiddleware({ router: appRouter, createContext }),
    );
  }
}
