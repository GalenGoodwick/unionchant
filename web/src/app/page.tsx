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
    </div>
  )
}
