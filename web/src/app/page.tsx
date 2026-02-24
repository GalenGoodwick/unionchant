import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import LandingPage from './LandingPage'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ landing?: string }>
}) {
  const params = await searchParams
  const session = await getServerSession(authOptions)

  // Show landing page if ?landing param exists OR user not authenticated
  if (params.landing || !session) {
    return <LandingPage isLoggedIn={!!session} />
  }

  // Authenticated users without ?landing → redirect to eye dashboard
  redirect('/eye')
}
