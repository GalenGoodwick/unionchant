import { redirect } from 'next/navigation'

// Old UI (DeliberationPageClientNew) — redirect into the current docked feed.
export default async function DeliberationV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/?dock=${id}`)
}
