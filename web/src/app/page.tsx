import { redirect } from 'next/navigation'

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v)
  }
  const query = qs.toString()
  // Everyone lands on /chants - forward any query params (e.g. ?dock=podium:xxx)
  redirect(`/chants${query ? `?${query}` : ''}`)
}
