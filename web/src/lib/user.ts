// User display utilities

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

interface UserForDisplay {
  name?: string | null
  status?: UserStatus | null
}

/**
 * Returns display name for a user, handling deleted/banned states
 * Shows "[deleted]" for deleted users and "[banned]" for banned users
 */
export function getDisplayName(user: UserForDisplay, fallback = 'Anonymous'): string {
  if (user.status === 'DELETED') {
    return '[deleted]'
  }
  if (user.status === 'BANNED') {
    return '[banned]'
  }
  return user.name || fallback
}
