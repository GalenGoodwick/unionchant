import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import WelcomeModal from '@/components/WelcomeModal'

export default async function Home() {
  const session = await getServerSession(authOptions)

  // Logged-in users go straight to chants
  if (session) {
    redirect('/chants')
  }

  // Logged-out users see welcome modal, then redirect to chants
  // (Modal will intercept and offer choice)
  return (
    <>
      <WelcomeModal />
      <div className="min-h-screen bg-background" />
    </>
  )
}
