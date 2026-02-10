import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { rpID, origin, consumeChallenge } from '@/lib/webauthn'

// POST /api/admin/webauthn/register-verify — verify registration and store credential
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id
  const { credential, deviceName } = await req.json()

  if (!credential) {
    return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
  }

  // Find the challenge for this user
  const challenge = credential.response?.clientDataJSON
    ? undefined // verifyRegistrationResponse extracts it internally
    : null

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

    await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: regCredential.id,
        publicKey: Buffer.from(regCredential.publicKey),
        counter: BigInt(regCredential.counter),
        transports: credential.response.transports || [],
        deviceName: deviceName || `${credentialDeviceType}${credentialBackedUp ? ' (backed up)' : ''}`,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WebAuthn] Registration verification failed:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }
}
