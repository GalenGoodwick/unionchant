import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Humanity',
  description: 'Technology built for consensus, not conflict. What happens when we give communities the tools to actually agree?',
}

export default function HumanityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
