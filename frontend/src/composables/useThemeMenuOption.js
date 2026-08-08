import { computed, h } from 'vue'
import { SunMoon, Sun, Moon, Monitor } from 'lucide-vue-next'
import { themeMode, switchTheme } from '@/utils/setupTheme'

const themeModes = [
	{ mode: 'light', icon: Sun, label: 'Light' },
	{ mode: 'dark', icon: Moon, label: 'Dark' },
	{ mode: 'automatic', icon: Monitor, label: 'Auto' },
]

const activeTheme = computed(
	() => themeModes.find(({ mode }) => mode === themeMode.value) || themeModes[0],
)

function cycleTheme(event) {
	event.preventDefault()
	const next = themeModes[(themeModes.indexOf(activeTheme.value) + 1) % themeModes.length]
	switchTheme(next.mode)
}

export function useThemeMenuOption() {
	return {
		label: 'Theme',
		icon: h(SunMoon),
		onClick: cycleTheme,
		slots: {
			label: () => h('div', { class: 'min-w-20 truncate' }, 'Theme'),
			suffix: () =>
				h(
					'span',
					{ class: 'flex w-16 items-center justify-end gap-2 text-ink-gray-5' },
					[
						h('span', activeTheme.value.label),
						h(activeTheme.value.icon),
					],
				),
		},
	}
}
