// Shared content limits — single source of truth for both the UI inputs and
// the API validators, so a limit change happens in exactly one place.

/** Max characters allowed in a submitted idea (UI maxLength + API validation). */
export const MAX_IDEA_LENGTH = 1000
