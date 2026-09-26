import { redirect } from 'next/navigation'

// The old standalone sign-up page is gone — email sign-up lives in the
// feed's AuthOverlay (mode=signup opens it directly).
export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams({ signin: '1', mode: 'signup' })
  const cb = sp.callbackUrl
  if (typeof cb === 'string' && cb) qs.set('callbackUrl', cb)
  redirect(`/?${qs.toString()}`)
}
