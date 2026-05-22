import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import Google from 'next-auth/providers/google';
import { prisma } from './prisma';

const providers: NextAuthConfig['providers'] = [];

if (process.env.EMAIL_SERVER_HOST) {
  providers.push(
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 1025),
        auth: process.env.EMAIL_SERVER_USER
          ? {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
      from: process.env.EMAIL_FROM ?? 'noreply@persona-studio.local',
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: 'database' },
  pages: {
    signIn: '/sign-in',
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as { id: string }).id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const bonus = Number(process.env.SIGNUP_BONUS_TOKENS ?? 10);
      if (!user.id || bonus <= 0) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenBalance: { increment: bonus } },
      });
      await prisma.tokenTransaction.create({
        data: {
          userId: user.id,
          amount: bonus,
          type: 'signup_bonus',
          reason: 'welcome',
        },
      });
    },
  },
});

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;
  const uid = (session.user as { id?: string }).id;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function getCurrentAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error('FORBIDDEN');
  return admin;
}
