<template>
	<Dialog
		v-model="show"
		:options="{
			title: __('Add Recipient'),
			actions: [
				{
					label: __('Add'),
					variant: 'solid',
					disabled: !email,
					loading: addRecipient.loading,
					onClick: addRecipient.submit,
				},
			],
		}"
	>
		<template #body-content>
			<div class="space-y-4">
				<FormControl v-model="email" :label="__('Email')" type="email" placeholder="someone@example.com" />
				<ErrorMessage
					:message="addRecipient.error && (addRecipient.error?.messages?.[0] || addRecipient.error?.message || __('Request failed.'))"
				/>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, ErrorMessage, FormControl, createResource } from 'frappe-ui'

import { raiseToast } from '@/apps/mail/utils'

const show = defineModel<boolean>()
const { messageId } = defineProps<{ messageId: string }>()
const emit = defineEmits(['reload'])

const email = ref('')

watch(show, () => {
	if (show.value) {
		email.value = ''
		addRecipient.reset()
	}
})

const addRecipient = createResource({
	url: 'suite.mail.api.admin.add_queued_recipient',
	makeParams: () => ({ message_id: messageId, email: email.value.trim() }),
	onSuccess: () => {
		show.value = false
		emit('reload')
		raiseToast(__('Recipient added.'))
	},
})
</script>
