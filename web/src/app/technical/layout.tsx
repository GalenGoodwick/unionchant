import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Technical Whitepaper',
  description: 'How adversarial deliberation produces consensus at scale. The math, tiers, and security properties behind structured small-group decision making.',
}

export default function TechnicalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
