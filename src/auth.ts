import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";

import { prisma } from "@/server/db";
import { ensureLegacyDataClaimedByFirstUser } from "@/server/boards";

export const authOptions: NextAuthOptions = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      httpOptions: {
        timeout: 15000,
      },
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || !account) {
        return false;
      }

      const normalizedEmail = user.email.toLowerCase();

      const dbUser = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name ?? undefined,
          avatarUrl: user.image ?? undefined,
        },
        create: {
          email: normalizedEmail,
          name: user.name ?? null,
          avatarUrl: user.image ?? null,
        },
      });

      await prisma.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        update: {
          userId: dbUser.id,
          accessToken: account.access_token ?? null,
          refreshToken: account.refresh_token ?? null,
          expiresAt: account.expires_at ?? null,
          tokenType: account.token_type ?? null,
          scope: account.scope ?? null,
          idToken: account.id_token ?? null,
        },
        create: {
          userId: dbUser.id,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          accessToken: account.access_token ?? null,
          refreshToken: account.refresh_token ?? null,
          expiresAt: account.expires_at ?? null,
          tokenType: account.token_type ?? null,
          scope: account.scope ?? null,
          idToken: account.id_token ?? null,
        },
      });

      await ensureLegacyDataClaimedByFirstUser(dbUser.id);
      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email.toLowerCase() },
          select: { id: true },
        });
        if (dbUser) {
          token.sub = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
