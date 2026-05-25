import { auth } from '@clerk/nextjs/server';
import { TRPCError, initTRPC } from '@trpc/server';
import { db, users } from '@vp/db';
import { eq } from 'drizzle-orm';
import superjson from 'superjson';

/**
 * tRPC context: resolves the Clerk user and lazily provisions a users row
 * (the Clerk webhook is the primary path, this is a safety net for dev).
 */
export async function createContext() {
  const { userId } = await auth();
  return { userId, db };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

  // Ensure a users row exists for FK integrity.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  if (!existing) {
    await db.insert(users).values({ id: ctx.userId, email: '' }).onConflictDoNothing();
  }

  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
