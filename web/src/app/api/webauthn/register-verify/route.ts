import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { rpID, origin, consumeChallenge } from '@/lib/webauthn'

// POST /api/webauthn/register-verify — verify registration, store credential, preserve account
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const { credential } = await req.json()

  if (!credential) {
    return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: (challenge: string) => consumeChallenge(challenge, userId),
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
    }

    const { credential: regCredential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    // Store credential and mark account as preserved (no longer anonymous)
    await prisma.$transaction([
      prisma.webAuthnCredential.create({
        data: {
          userId,
          credentialId: regCredential.id,
          publicKey: Buffer.from(regCredential.publicKey),
          counter: BigInt(regCredential.counter),
          transports: credential.response.transports || [],
          deviceName: `${credentialDeviceType}${credentialBackedUp ? ' (backed up)' : ''}`,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { isAnonymous: false },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WebAuthn] Registration verification failed:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }
}
