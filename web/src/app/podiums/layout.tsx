import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Podiums',
  description: 'Read long-form posts on Union Chant. Explore context and perspectives behind collective decisions.',
}

export default function PodiumsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
