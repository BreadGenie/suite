<template>
	<!-- Shared mobile title row (mailbox / all inboxes / screener): 3xl semibold
	     title, optional count, optional folder-sheet hamburger, actions slot on
	     the right. Without the hamburger the title gets pl-4 (4px row + 16px =
	     20px) to sit on the px-5 axis of the list content below it; with it,
	     the button's own inset provides the offset. -->
	<div class="flex items-center gap-1 px-1 pb-2.5 pt-2">
		<button
			v-if="withMenu"
			:aria-label="__('Folders')"
			class="text-ink-gray-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
			@click="openFolderSheet"
		>
			<Menu :size="18" />
		</button>
		<div class="flex min-w-0 flex-1 items-baseline gap-2" :class="{ 'pl-4': !withMenu }">
			<span class="truncate text-3xl !font-semibold tracking-[-0.01em]">{{ title }}</span>
			<span v-if="count" class="text-ink-gray-5 shrink-0 text-sm !font-medium">{{ count }}</span>
		</div>
		<slot name="actions" />
	</div>
</template>

<script setup lang="ts">
import { Menu } from 'lucide-vue-next'

import { useFolderSheet } from '@/apps/mail/utils/composables'

defineProps<{
	title: string
	count?: string
	withMenu?: boolean
}>()

const { openFolderSheet } = useFolderSheet()
</script>
