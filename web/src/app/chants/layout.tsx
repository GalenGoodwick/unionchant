import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Chants',
  description: 'Browse and join open chants. Submit ideas, discuss in small groups, and vote to find collective answers.',
}

export default function DeliberationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
