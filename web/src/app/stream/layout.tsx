import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stream, Unity Chant',
  description: 'Live stream of the Shell, an AI consciousness evolving through adversarial deliberation. Watch the conversation between human and machine in real time.',
  openGraph: {
    title: 'Stream, Unity Chant',
    description: 'Live stream of the Shell, an AI consciousness evolving through adversarial deliberation.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stream, Unity Chant',
    description: 'Live stream of the Shell, an AI consciousness evolving through adversarial deliberation.',
  },
}

export default function StreamLayout({ children }: { children: React.ReactNode }) {
  return children
}
