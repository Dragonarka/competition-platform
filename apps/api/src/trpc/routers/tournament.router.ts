import { sql, eq, desc } from 'drizzle-orm';
import { t } from '../trpc.init';
import { protectedProcedure } from '../trpc.procedures';
import { competitions } from '@competition-platform/db';
import { createCompetitionSchema } from '@competition-platform/shared';
import type { DatabaseService } from '../../modules/database/database.service';

export function createTournamentRouter(db: DatabaseService) {
  return t.router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.db.transaction(async (tx) => {
        await tx.execute(
          sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
        );
        return tx
          .select({
            id: competitions.id,
            name: competitions.name,
            description: competitions.description,
            date: competitions.date,
            status: competitions.status,
            createdAt: competitions.createdAt,
          })
          .from(competitions)
          .where(eq(competitions.organizerClerkId, ctx.userId))
          .orderBy(desc(competitions.createdAt));
      });
    }),

    create: protectedProcedure
      .input(createCompetitionSchema)
      .mutation(async ({ ctx, input }) => {
        return db.db.transaction(async (tx) => {
          await tx.execute(
            sql`SET LOCAL session.current_organizer_id = ${ctx.userId}`,
          );
          const [created] = await tx
            .insert(competitions)
            .values({
              organizerClerkId: ctx.userId,
              name: input.name,
              description: input.description ?? null,
              date: input.date ? new Date(input.date) : null,
            })
            .returning({
              id: competitions.id,
              name: competitions.name,
              description: competitions.description,
              date: competitions.date,
              status: competitions.status,
              createdAt: competitions.createdAt,
            });
          return created;
        });
      }),
  });
}

export type TournamentRouter = ReturnType<typeof createTournamentRouter>;
