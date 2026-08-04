<template>
	<BottomSheet v-model:open="isProfileSheetOpen">
		<div class="px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
			<!-- Accounts: tap to switch (no add-account flow on mobile). -->
			<div class="text-ink-gray-5 px-3 pb-1 pt-1 text-sm">{{ __('Accounts') }}</div>
			<button
				v-for="account in accounts"
				:key="account.id"
				:class="rowClass"
				@click="switchAccount(account.id)"
			>
				<Avatar :label="account._name" size="md" />
				<span class="flex-1 truncate text-left">{{ account._name }}</span>
				<Check v-if="account.id === store.accountId" class="text-ink-gray-6 icon shrink-0" />
			</button>

			<div class="border-outline-gray-1 my-2 border-t" />

			<button :class="rowClass" @click="openAppSettings">
				<Settings class="text-ink-gray-6 h-[18px] w-[18px] shrink-0" />
				<span class="flex-1 truncate text-left">{{ __('Settings') }}</span>
			</button>
			<button :class="rowClass" @click="logout.submit">
				<LogOut class="text-ink-red-6 h-[18px] w-[18px] shrink-0" />
				<span class="text-ink-red-6 flex-1 truncate text-left">{{ __('Log Out') }}</span>
			</button>
		</div>
	</BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, LogOut, Settings } from 'lucide-vue-next'
import { Avatar, BottomSheet } from 'frappe-ui'

import { useAccountSwitch, useProfileSheet, useSettings } from '@/apps/mail/utils/composables'
import { sessionStore } from '@/apps/mail/stores/session'
import { userStore } from '@/apps/mail/stores/user'

const store = userStore()
const { logout } = sessionStore()
const { isProfileSheetOpen, closeProfileSheet } = useProfileSheet()
const { openSettings } = useSettings()

const accounts = computed(() => store.userResource?.data?.accounts ?? [])

// Shared with the sidebar's account submenu — stays in place on account-scoped
// routes and in All Inboxes (see useAccountSwitch).
const { switchAccount: doSwitchAccount } = useAccountSwitch()
const switchAccount = (accountId: string) => {
	closeProfileSheet()
	doSwitchAccount(accountId)
}

const openAppSettings = () => {
	closeProfileSheet()
	// The sheet (z-50) closes above the settings dialog (which has no z-index),
	// so present settings only after the sheet's ~200ms exit — otherwise the
	// dialog's slide-up plays hidden behind the closing sheet and reads as no
	// animation at all.
	setTimeout(openSettings, 250)
}

const rowClass =
	'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base text-ink-gray-8 active:bg-surface-gray-1'
</script>
