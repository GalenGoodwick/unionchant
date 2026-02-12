'use client'

import { useParams } from 'next/navigation'
import { useEmbedAuth } from '@/components/EmbedAuthContext'
import ChantSimulator from '@/app/chants/[id]/ChantSimulator'

export default function EmbedChantPage() {
  const params = useParams<{ chantId: string }>()
  const { token } = useEmbedAuth()

  return (
    <ChantSimulator id={params.chantId} authToken={token} />
  )
}
