/**
 * Feature flags for experimental/optional subsystems.
 * Set corresponding env vars to "true" to enable.
 * All default to OFF.
 */

export const FEATURE_SHELL = process.env.NEXT_PUBLIC_FEATURE_SHELL === 'true'
export const FEATURE_EYE = process.env.NEXT_PUBLIC_FEATURE_EYE === 'true'
export const FEATURE_CRADLE = process.env.NEXT_PUBLIC_FEATURE_CRADLE === 'true'
