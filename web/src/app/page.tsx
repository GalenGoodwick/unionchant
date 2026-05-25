import { redirect } from 'next/navigation'

export default function Home() {
  // Everyone lands on /chants - browse without friction
  redirect('/chants')
}
