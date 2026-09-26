import { redirect } from 'next/navigation'

// Old UI (DetailsPageClient) — redirect into the current docked feed.
export default async function DetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/?dock=${id}`)
}
