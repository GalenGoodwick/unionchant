import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { rpID, storeChallenge } from '@/lib/webauthn'

// GET /api/webauthn/authenticate-options — discoverable credential auth (no session needed)
export async function GET() {
  // Use a placeholder userId for the challenge store — the real userId
  // will be resolved from the credential during verification
  const placeholderId = '__passkey_signin__'

  const options = await generateAuthenticationOptions({
    rpID,
    // Empty allowCredentials = discoverable credential flow (browser finds resident key)
    allowCredentials: [],
    userVerification: 'required',
  })

  storeChallenge(options.challenge, placeholderId)

  return NextResponse.json({ ...options, hints: ['client-device'] })
}
