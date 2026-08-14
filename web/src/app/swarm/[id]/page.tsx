import SwarmDeck from './SwarmDeck'

// Server wrapper: resolve the route param, hand the id to the live client deck.
export default async function SwarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SwarmDeck id={id} />
}
