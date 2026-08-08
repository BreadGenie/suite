import { ref } from 'vue'
import { frappeRequest } from 'frappe-ui'
import { useSessionStore } from '@/boot/session'

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

export const systemDark = ref(systemTheme.matches)
systemTheme.addEventListener('change', (e) => (systemDark.value = e.matches))

export function getThemeMode() {
	return document.documentElement.getAttribute('data-theme-mode') || 'light'
}

export const themeMode = ref(getThemeMode())

let initialized = false

export async function setupTheme() {
	if (initialized) return
	initialized = true

	applyTheme(import.meta.env.DEV ? await getSavedTheme() : getThemeMode())

	systemTheme.addEventListener('change', () => {
		if (getThemeMode() === 'automatic') applyTheme('automatic')
	})
}

export function switchTheme(theme) {
	applyTheme(theme)
	saveTheme(theme)
}

function applyTheme(mode) {
	mode = mode.toLowerCase()
	const resolved = mode === 'automatic' ? systemPreference() : mode

	const root = document.documentElement
	root.classList.add('theme-switching')
	root.style.colorScheme = resolved
	root.setAttribute('data-theme', resolved)
	root.setAttribute('data-theme-mode', mode)
	themeMode.value = mode

	requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

function systemPreference() {
	return systemTheme.matches ? 'dark' : 'light'
}

async function getSavedTheme() {
	const session = useSessionStore()
	if (!session.isLoggedIn) return 'light'

	try {
		const value = await frappeRequest({
			url: 'frappe.client.get_value',
			params: { doctype: 'User', fieldname: 'desk_theme', filters: session.user },
		})
		return value?.desk_theme || 'light'
	} catch {
		return getThemeMode()
	}
}

function saveTheme(theme) {
	if (!useSessionStore().isLoggedIn) return

	frappeRequest({
		url: 'frappe.core.doctype.user.user.switch_theme',
		params: { theme: capitalize(theme) },
	})
}

function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1)
}
