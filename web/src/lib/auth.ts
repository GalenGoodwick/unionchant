import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from './prisma'
import { checkRateLimit } from './rate-limit'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    // Discord OAuth
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? [
          DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            authorization: { params: { scope: 'identify email' } },
          }),
        ]
      : []),

    // Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // GitHub OAuth
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),

    // Email/password credentials
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Rate limit login attempts by email (10/min)
        const rateLimited = await checkRateLimit('login', credentials.email)
        if (rateLimited) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: { id: true, email: true, name: true, image: true, passwordHash: true, status: true },
        })

        if (!user || !user.passwordHash) return null
        if (user.status === 'BANNED') return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        // Reactivate self-deleted accounts on login
        if (user.status === 'DELETED') {
          await prisma.user.update({
            where: { id: user.id },
            data: { status: 'ACTIVE', deletedAt: null },
          })
        }

        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Skip status check for credentials (already handled in authorize)
      if (account?.provider === 'credentials') return true

      // Discord account merging: bot-created users have synthetic emails.
      // We need to find them by discordId and merge before PrismaAdapter creates a duplicate.
      const discordProfile = profile as { id?: string; username?: string; avatar?: string; email?: string } | undefined
      if (account?.provider === 'discord' && discordProfile?.id) {
        try {
          const discordId = String(discordProfile.id)
          const existingUser = await prisma.user.findUnique({
            where: { discordId },
          })

          if (existingUser) {
            // Bot-created user exists — merge: update their profile and link the OAuth account
            const realEmail = discordProfile.email || user.email
            const avatarUrl = user.image || (discordProfile.avatar
              ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
              : null)

            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                ...(realEmail && !realEmail.endsWith('@bot.unitychant.com') ? { email: realEmail } : {}),
                ...(user.name ? { name: user.name } : {}),
                ...(avatarUrl ? { image: avatarUrl } : {}),
                emailVerified: new Date(),
              },
            })

            // Upsert the OAuth Account record so NextAuth recognizes this link
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: 'discord',
                  providerAccountId: discordId,
                },
              },
              update: {
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
              create: {
                userId: existingUser.id,
                type: account.type,
                provider: 'discord',
                providerAccountId: discordId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            })

            // Override the user object so JWT callback gets the right ID
            user.id = existingUser.id
            return true
          }

          // No existing bot user — let PrismaAdapter create normally, then set discordId
          // We do this in a post-create step via the jwt callback
        } catch (error) {
          console.error('Error merging Discord account:', error)
        }
      }

      // Check if user is banned (deleted users can reactivate by logging in)
      try {
        if (user?.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, status: true },
          })
          if (dbUser?.status === 'BANNED') {
            return false
          }
          // Reactivate self-deleted accounts on OAuth login
          if (dbUser?.status === 'DELETED') {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { status: 'ACTIVE', deletedAt: null },
            })
          }
        }
      } catch (error) {
        console.error('Error checking user status:', error)
      }
      return true
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub || token.id) as string
      }
      return session
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      if (user) {
        token.id = user.id
        token.sub = user.id
      }

      // For new Discord signups (not bot-merged), set discordId on the user
      const jwtDiscordProfile = profile as { id?: string } | undefined
      if (account?.provider === 'discord' && jwtDiscordProfile?.id && user?.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { discordId: true },
          })
          if (!dbUser?.discordId) {
            await prisma.user.update({
              where: { id: user.id },
              data: { discordId: String(jwtDiscordProfile.id) },
            })
          }
        } catch (error) {
          console.error('Error setting discordId:', error)
        }
      }

      // When session is updated (e.g. onboarding name change), persist to token
      if (trigger === 'update' && session) {
        if (session.name) token.name = session.name
        if (session.image) token.picture = session.image
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}
