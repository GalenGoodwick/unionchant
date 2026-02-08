import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo - Watch a Movement Find Consensus',
  description: 'Step through an interactive demo: 1,000 people with one cause but no agreement. Watch them form small groups, deliberate, and arrive at consensus.',
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
