import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { rpID, storeChallenge } from '@/lib/webauthn'

// GET /api/admin/webauthn/authenticate-options — generate auth challenge
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  })

  if (credentials.length === 0) {
    return NextResponse.json({ error: 'No passkeys registered' }, { status: 400 })
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(c => ({
      id: c.credentialId,
      transports: ['internal'] as AuthenticatorTransport[],
    })),
    userVerification: 'required',
  })

  storeChallenge(options.challenge, userId)

  // Force platform authenticator (Touch ID) — no QR code / cross-device options
  return NextResponse.json({ ...options, hints: ['client-device'] })
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'
