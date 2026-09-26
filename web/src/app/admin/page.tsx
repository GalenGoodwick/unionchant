import { redirect } from 'next/navigation'

// The admin console now lives inside the docked feed UI (profile panel →
// ADMIN chip, components/AdminPanel.tsx). Old bookmarks land there.
export default function AdminPage() {
  redirect('/?view=admin')
}
