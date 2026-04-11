import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Whitepaper',
  description: 'Collective decision-making for the modern age. How small-group deliberation scales from 5 people to millions and produces better outcomes than voting.',
}

export default function WhitepaperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
