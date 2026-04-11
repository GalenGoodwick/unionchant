import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Small groups of 5 read, discuss, and vote. Winners advance. After a few rounds, one consensus remains. 25 people need 2 rounds. A million need 9.',
}

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
