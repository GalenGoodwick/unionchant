import { redirect } from 'next/navigation'

// Settings now lives inside the main single-panel UI (profile tab).
export default function SettingsRedirect() {
  redirect('/chants?view=settings')
}
