<template>
	<div :class="{ 'fixed left-0 right-0 z-20': isMobile }" :style="{ bottom: toolbarBottom }">
		<div
			class="flex flex-wrap justify-between gap-2 overflow-hidden pt-2.5"
			:class="{ 'pb-2.5': isMobile }"
		>
			<!-- Text editor buttons -->
			<div class="flex items-center gap-1 overflow-x-auto" :class="{ 'px-3': isMobile }">
				<TextEditorFixedMenu :buttons class="!bg-inherit" />
				<EmojiPicker
					v-if="!isMobile"
					v-slot="{ togglePopover }"
					@update:model-value="emit('appendEmoji', $event)"
				>
					<Button variant="ghost" class="max-h-6 max-w-6" @click="togglePopover()">
						<template #icon>
							<Laugh class="icon" />
						</template>
					</Button>
				</EmojiPicker>
				<Button variant="ghost" class="max-h-6 max-w-6" @click="fileInput?.click()">
					<template #icon>
						<Paperclip class="icon" />
					</template>
				</Button>
				<input
					ref="fileInput"
					type="file"
					class="hidden"
					multiple
					@change="onFilesSelected"
				/>
			</div>

			<!-- Send & Discard -->
			<div v-if="!isMobile" class="ml-auto flex items-center space-x-2">
				<Button
					:label="__('Discard')"
					:tooltip="__('Discard ({0}+D)', [modifier])"
					:icon-left="Trash2"
					@click="emit('discardMail')"
				/>
				<!-- Split button: one pill, the 1px gap shows the toolbar background as the divider. -->
				<div class="flex items-center gap-px">
					<Button
						variant="solid"
						:label="__('Send')"
						:tooltip="__('Send ({0}+Enter)', [modifier])"
						:icon-left="SendHorizontal"
						:disabled="isRecipientsEmpty"
						class="!rounded-r-none"
						@click="emit('sendMail')"
					/>
					<Dropdown :options="sendOptions" placement="top-end">
						<Button
							variant="solid"
							:tooltip="__('Schedule send')"
							:disabled="isRecipientsEmpty"
							class="!rounded-l-none"
						>
							<template #icon>
								<ChevronDown class="h-4 w-4" />
							</template>
						</Button>
					</Dropdown>
				</div>
			</div>
		</div>
	</div>
</template>
<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { CalendarClock, ChevronDown, Laugh, Paperclip, SendHorizontal, Trash2 } from 'lucide-vue-next'
import { Button, Dropdown, TextEditorFixedMenu } from 'frappe-ui'

import { isMac } from '@/apps/mail/utils'
import { useScreenSize, useTextEditorButtons, useVisualViewport } from '@/apps/mail/utils/composables'
import EmojiPicker from '@/apps/mail/components/EmojiPicker.vue'

const { isRecipientsEmpty } = defineProps<{
	isRecipientsEmpty: boolean
}>()

const emit = defineEmits(['appendEmoji', 'selectFiles', 'discardMail', 'sendMail', 'scheduleSend'])

const modifier = computed(() => (isMac ? '⌘' : 'Ctrl'))

const sendOptions = [
	{
		label: __('Schedule send'),
		icon: CalendarClock,
		onClick: () => emit('scheduleSend'),
	},
]

// Make toolbar hover over keyboard on mobile

const { isMobile } = useScreenSize()
const { buttons } = useTextEditorButtons()

const toolbarBottom = useVisualViewport(
	(viewport) => `${window.innerHeight - viewport.height - viewport.offsetTop}px`,
)

const fileInput = useTemplateRef('fileInput')

const onFilesSelected = async (e: Event) => {
	const input = e.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (!files.length) return

	emit('selectFiles', files)
	input.value = ''
}
</script>

<!-- todo: file upload -> discard race condition (draft saved) -->
