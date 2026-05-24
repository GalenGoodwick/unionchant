import { redirect } from 'next/navigation'

export default async function Home() {
  // Landing page moved to /how - redirect everyone to main app
  redirect('/chants')
}
