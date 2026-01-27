import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Deliberations',
  description: 'Browse and join public deliberations. Participate in collective decision-making on Union Chant.',
}

export default function DeliberationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
