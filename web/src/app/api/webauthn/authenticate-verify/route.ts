import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { rpID, origin, createPasskeyToken, consumeChallengeAny } from '@/lib/webauthn'

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'

// POST /api/webauthn/authenticate-verify — verify passkey and return signin token (no session needed)
export async function POST(req: NextRequest) {
  const { credential } = await req.json()

  if (!credential) {
    return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
  }

  // Look up credential in DB
  const storedCredential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: credential.id },
    include: { user: { select: { id: true, email: true, status: true } } },
  })

  if (!storedCredential) {
    return NextResponse.json({ error: 'Unknown credential' }, { status: 400 })
  }

  if (storedCredential.user.status === 'BANNED') {
    return NextResponse.json({ error: 'Account banned' }, { status: 403 })
  }

  const userId = storedCredential.userId

  try {
    // For discoverable credentials, verify the challenge with the placeholder userId
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: (challenge: string) => consumeChallengeAny(challenge),
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

    // Return a short-lived token that the client exchanges via NextAuth signIn
    const passkeyToken = createPasskeyToken(userId)

    return NextResponse.json({ success: true, passkeyToken })
  } catch (error) {
    console.error('[WebAuthn] Authentication verification failed:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }
}
