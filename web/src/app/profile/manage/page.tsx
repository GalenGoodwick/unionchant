import { redirect } from 'next/navigation'

// Manage now lives inside the main single-panel UI (profile tab).
export default function ManageRedirect() {
  redirect('/chants?view=manage')
}
