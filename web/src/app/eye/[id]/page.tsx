import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import EyeViewer from './EyeViewer'

export default async function EyeViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const eye = await prisma.eye.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      connected: true,
      state: true,
      lastSync: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!eye) notFound()

  return <EyeViewer eye={eye} />
}
