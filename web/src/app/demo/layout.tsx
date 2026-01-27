import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo',
  description: 'Watch Union Chant in action. See how 25 participants deliberate through tiered voting to reach consensus.',
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
