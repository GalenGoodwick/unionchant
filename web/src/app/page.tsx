import { Metadata } from 'next'
import Header from '@/components/Header'
import LandingParallax from '@/components/LandingParallax'

export const metadata: Metadata = {
  title: 'Unity Chant - Consensus at Scale',
  description: 'One place where humanity decides together. Submit ideas, deliberate in small groups, reach consensus at any scale.',
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LandingParallax />
      <div className="sr-only" role="note" aria-label="Accessibility information">
        Unity Chant uses a button-chase challenge to verify you are human.
        Audio cues help with this: a rising vroom sound with a drum roll means the chase started.
        A ding means the button stopped — tap anywhere in the box to catch it.
        A falling vroom sound means you passed. The timer counts all finger movement across the box.
      </div>
    </div>
  )
}
