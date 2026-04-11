import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { rpName, rpID, storeChallenge } from '@/lib/webauthn'

// GET /api/webauthn/register-options — generate registration challenge for any authenticated user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.user.email || userId,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
  })

  await storeChallenge(options.challenge, userId)

  return NextResponse.json({ ...options, hints: ['client-device'] })
}
