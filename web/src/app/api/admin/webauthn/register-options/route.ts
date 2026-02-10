import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { rpName, rpID, storeChallenge } from '@/lib/webauthn'

// GET /api/admin/webauthn/register-options — generate registration challenge
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  })

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.user.email,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  })

  storeChallenge(options.challenge, userId)

  // Force platform authenticator (Touch ID) — no QR code / cross-device options
  return NextResponse.json({ ...options, hints: ['client-device'] })
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'
