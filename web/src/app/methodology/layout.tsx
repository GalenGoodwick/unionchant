import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'The math and process behind fractal deliberation. Tiered elimination, random cell assignment, and why an idea must survive real scrutiny to win.',
}

export default function MethodologyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
