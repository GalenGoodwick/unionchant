import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import WelcomePage from './WelcomePage'

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/chants')
  }

  return <WelcomePage />
}
