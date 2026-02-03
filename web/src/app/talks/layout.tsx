import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Talks',
  description: 'Browse and join open talks. Submit ideas, discuss in small groups, and vote to find collective answers.',
}

export default function DeliberationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
