import { t } from '../trpc.init';
import { protectedProcedure } from '../trpc.procedures';

export const authRouter = t.router({
  getMe: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
  })),
});
