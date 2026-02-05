import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Groups',
  description: 'Browse and join groups on Unity Chant. Collaborate with your community on collective decisions.',
}

export default function GroupsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
