<template>
	<div class="bg-surface-base fixed inset-0 z-20 flex flex-col pt-[env(safe-area-inset-top)]">
		<!-- Root bar — same compact-header recipe as ThreadHeader: -ml-2 cancels
		     the ghost button's padding so the chevron glyph lands on the body's
		     px-3 axis. -->
		<div class="bg-surface-base flex h-14 shrink-0 items-center border-b px-3">
			<Button variant="ghost" class="-ml-2 mr-2 !h-8 !w-8 shrink-0" @click="emit('close')">
				<template #icon>
					<ChevronLeft class="icon !h-[18px] !w-[18px]" />
				</template>
			</Button>

			<h2 class="min-w-0 flex-1 truncate text-2xl !font-semibold tracking-[-0.01em]">
				{{ __('Settings') }}
			</h2>
		</div>

		<!-- Root: grouped section list mirroring the desktop dialog's groups. The
		     Profile tab reaches the same rows through ProfileView (see useSettingsTabs);
		     this page stays for the entry points that aren't the tab bar — the sidebar,
		     and the Block List / Screener links inside a thread. -->
		<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
			<template v-for="group in groups" :key="group.label">
				<div class="text-ink-gray-5 px-1 pb-1 pt-3 text-sm">{{ group.label }}</div>
				<button
					v-for="tab in group.items"
					:key="tab.value"
					class="active:bg-surface-gray-1 text-ink-gray-8 flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-base"
					@click="activeTab = tab"
				>
					<component :is="tab.icon" class="text-ink-gray-6 h-4 w-4 shrink-0" />
					<span class="flex-1 truncate text-left">{{ tab.label }}</span>
					<ChevronRight class="text-ink-gray-4 h-4 w-4 shrink-0" />
				</button>
			</template>
		</div>

		<MobileSettingsSubPage :tab="activeTab" safe-area-top @close="activeTab = null" />
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from 'frappe-ui'

import { useSettingsTabs, type SettingsTab } from '@/apps/mail/composables/useSettingsTabs'
import MobileSettingsSubPage from '@/apps/mail/components/mobile/MobileSettingsSubPage.vue'

const emit = defineEmits(['close'])

const { groups } = useSettingsTabs()

const activeTab = ref<SettingsTab | null>(null)
</script>
