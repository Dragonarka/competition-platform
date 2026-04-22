import { t } from './trpc.init';
import { authRouter } from './routers/auth.router';
import { createTournamentRouter } from './routers/tournament.router';
import type { DatabaseService } from '../modules/database/database.service';

export { t };

export function createAppRouter(db: DatabaseService) {
  return t.router({
    auth: authRouter,
    tournament: createTournamentRouter(db),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
