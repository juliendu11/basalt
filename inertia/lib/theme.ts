import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/**
 * Theme state is shared module-wide so every `useTheme()` caller (sidebar,
 * navbar, mobile header) stays in sync. The `data-theme` attribute on `<html>`
 * is what DaisyUI reads; a blocking script in `inertia_layout.edge` sets it
 * before Vue mounts to avoid a flash, and this module keeps it in lockstep
 * with `localStorage` afterwards.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function systemPrefersDark(): boolean {
  return isBrowser() && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStoredTheme(): Theme | null {
  if (!isBrowser()) return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light')
}

function applyTheme(value: Theme): void {
  if (isBrowser()) {
    document.documentElement.setAttribute('data-theme', value)
  }
}

const theme = ref<Theme>(resolveInitialTheme())

export function useTheme() {
  function setTheme(value: Theme): void {
    theme.value = value
    if (isBrowser()) {
      window.localStorage.setItem(STORAGE_KEY, value)
    }
    applyTheme(value)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
