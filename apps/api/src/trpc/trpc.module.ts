import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { verifyToken } from '@clerk/backend';
import type { Request, Response } from 'express';
import { createAppRouter } from './trpc.router';
import type { TrpcContext } from './trpc.context';
import { DatabaseService } from '../modules/database/database.service';

async function createContext({
  req,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return { userId: null };
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return { userId: null };
  }
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env['CLERK_SECRET_KEY'] ?? '',
    });
    return { userId: payload.sub };
  } catch {
    return { userId: null };
  }
}

@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly databaseService: DatabaseService,
  ) {}

  onModuleInit(): void {
    const appRouter = createAppRouter(this.databaseService);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const expressApp = this.httpAdapterHost.httpAdapter.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    expressApp.use(
      '/trpc',
      createExpressMiddleware({ router: appRouter, createContext }),
    );
  }
}
