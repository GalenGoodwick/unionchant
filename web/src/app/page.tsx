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

  // Show landing page only if explicitly requested via ?landing
  if (params.landing) {
    const session = await getServerSession(authOptions)
    return <LandingPage isLoggedIn={!!session} />
  }

  // Default: chants page is the landing page
  redirect('/chants')
}
