import { t } from './trpc.init';
import { authRouter } from './routers/auth.router';
import { createTournamentRouter } from './routers/tournament.router';
import type { DatabaseService } from '../modules/database/database.service';
import type { ICompetitionGateway } from '../modules/websocket/competition-gateway.interface';

export { t };

export function createAppRouter(
  db: DatabaseService,
  gateway: ICompetitionGateway,
) {
  return t.router({
    auth: authRouter,
    tournament: createTournamentRouter(db, gateway),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
