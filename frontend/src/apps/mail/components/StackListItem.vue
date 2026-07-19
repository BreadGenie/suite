<template>
	<MailRow
		:is-selected
		:unread="!!unreadCount"
		:avatar-label="getSenderInitial(latest)"
		:avatar-image="latest.user_image"
		:datetime="latest.received_at"
		:subject-italic="!latest.subject"
		:preview-italic="!latest.preview"
		role="button"
		:aria-expanded="expanded"
		@click="emit('toggle')"
		@set-selected="(selected: boolean) => emit('setSelected', selected)"
	>
		<template #sender>{{ latest.from_name || latest.from_email }}</template>

		<template #badges>
			<Badge size="sm" :label="String(threads.length)" />
		</template>

		<template #subject>{{ latest.subject || __('[No subject]') }}</template>
		<template #preview>{{ latest.preview || __('— No message body —') }}</template>

		<!-- The chevron takes the star's place rather than claiming a column of its own, so a stack row's
		     sender and date line up with every thread row around it. -->
		<template #trailing="{ isHovered }">
			<MailRowActions
				:is-hovered
				:threads
				:show-star="false"
				@set-seen="(seen: boolean) => emit('setSeen', seen)"
				@archive="emit('archiveThreads')"
				@trash="emit('trashThreads')"
				@delete="emit('deleteThreads')"
			/>
			<component :is="expanded ? ChevronDown : ChevronRight" class="icon text-ink-gray-5" />
		</template>
	</MailRow>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { Badge } from 'frappe-ui'

import { getSenderInitial } from '@/apps/mail/utils'
import MailRow from '@/apps/mail/components/MailRow.vue'
import MailRowActions from '@/apps/mail/components/MailRowActions.vue'

import type { Thread } from '@/apps/mail/types'

// A collapsed run of adjacent threads from one sender on one day (see utils/threadStacks). Purely
// presentational: it owns neither its expansion nor its selection state.
//
// Its hover actions apply to every member at once, so each one names the count and every move it makes
// is undoable.
const { threads, expanded, isSelected } = defineProps<{
	threads: Thread[]
	expanded: boolean
	isSelected: boolean
}>()

const emit = defineEmits<{
	toggle: []
	setSelected: [selected: boolean]
	setSeen: [seen: boolean]
	archiveThreads: []
	trashThreads: []
	deleteThreads: []
}>()

// The list is newest-first, so the run's first member is its latest — the row this stack stands in for.
const latest = computed(() => threads[0])

const unreadCount = computed(() => threads.filter((t) => !t.seen).length)
</script>
