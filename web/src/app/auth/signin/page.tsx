import { redirect } from 'next/navigation'

// The old standalone sign-in page is gone — auth lives in the feed's
// AuthOverlay. This stays as NextAuth's pages.signIn target and forwards
// its params (error / verified / callbackUrl) into the overlay.
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams({ signin: '1' })
  for (const key of ['error', 'verified', 'callbackUrl'] as const) {
    const v = sp[key]
    if (typeof v === 'string' && v) qs.set(key, v)
  }
  redirect(`/?${qs.toString()}`)
}
