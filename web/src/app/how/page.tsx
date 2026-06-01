import { cookies } from 'next/headers'
import WelcomePage from '../WelcomePage'

export default async function HowPage() {
  // Mark visitor as seen so they go to /chants next time
  const cookieStore = await cookies()
  if (!cookieStore.get('uc_visited')) {
    cookieStore.set('uc_visited', '1', {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
    })
  }
  return <WelcomePage />
}
