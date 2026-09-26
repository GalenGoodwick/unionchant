import { redirect } from 'next/navigation'

// The standalone chant page is the OLD UI (ChantSimulator). All traffic —
// shared links, QR codes, bookmarks — lands in the current docked feed UI
// instead. The old component itself is still used by the /embed route.
export default async function DeliberationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/?dock=${id}`)
}
