import suiteRouter from '@/router'

/**
 * Sheets router shim: re-exports the single suite router instance so
 * non-component modules in sheets can navigate. Views/composables should
 * prefer `useRouter()` / `useRoute()`; this exists for the few module-scope
 * helpers that can't.
 */
export const router = suiteRouter

/** Absolute URL for a sheet by id — used when opening a sheet in a new tab. */
export function sheetUrl(id: string): string {
  return `${window.location.origin}/sheets/${encodeURIComponent(id)}`
}
