import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { rpID, origin, consumeChallenge } from '@/lib/webauthn'
import { setAdminVerifiedCookie } from '@/lib/admin-session'

// POST /api/admin/webauthn/authenticate-verify — verify passkey and set admin cookie
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id
  const { credential } = await req.json()

  if (!credential) {
    return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
  }

  // Look up the credential in DB
  const storedCredential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: credential.id },
  })

  if (!storedCredential || storedCredential.userId !== userId) {
    return NextResponse.json({ error: 'Unknown credential' }, { status: 400 })
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: (challenge: string) => consumeChallenge(challenge, userId),
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: storedCredential.credentialId,
        publicKey: storedCredential.publicKey,
        counter: Number(storedCredential.counter),
        transports: storedCredential.transports as AuthenticatorTransport[],
      },
      requireUserVerification: true,
    })

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
    }

    // Update counter and last used
    await prisma.webAuthnCredential.update({
      where: { id: storedCredential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    })

    // Set admin verified cookie
    const res = NextResponse.json({ success: true })
    return setAdminVerifiedCookie(res, userId)
  } catch (error) {
    console.error('[WebAuthn] Authentication verification failed:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'
