import prisma from '@/lib/prisma'

/**
 * Resolve a Discord user to a Unity Chant User.
 * Finds by discordId or creates with a synthetic email.
 * Bot-created users are pre-verified (trusted source).
 */
export async function resolveDiscordUser(
  discordUserId: string,
  discordUsername: string,
  discordAvatar?: string | null,
) {
  // Try to find existing user by discordId
  const byDiscordId = await prisma.user.findUnique({
    where: { discordId: discordUserId },
  })
  if (byDiscordId) return byDiscordId

  // Also check by synthetic email (may exist from previous registration)
  const syntheticEmail = `discord_${discordUserId}@bot.unitychant.com`
  const byEmail = await prisma.user.findUnique({
    where: { email: syntheticEmail },
  })
  if (byEmail) {
    // Link discordId if missing
    if (!byEmail.discordId) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { discordId: discordUserId },
      })
    }
    return byEmail
  }

  // Create new user with synthetic email
  const now = new Date()
  const user = await prisma.user.create({
    data: {
      email: syntheticEmail,
      name: discordUsername,
      image: discordAvatar
        ? `https://cdn.discordapp.com/avatars/${discordUserId}/${discordAvatar}.png`
        : null,
      discordId: discordUserId,
      emailVerified: now,
      captchaVerifiedAt: now,
      onboardedAt: now,
    },
  })

  return user
}
