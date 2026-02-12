'use client'

import { useParams } from 'next/navigation'
import ChantSimulator from '@/app/chants/[id]/ChantSimulator'

export default function EmbedChantPage() {
  const params = useParams<{ chantId: string }>()

  return (
    <ChantSimulator id={params.chantId} />
  )
}
