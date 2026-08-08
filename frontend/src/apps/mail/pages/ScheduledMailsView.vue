<template>
	<div class="flex h-full flex-col">
		<header
			class="flex items-center justify-between border-b px-3 py-2.5 max-sm:p-0 sm:px-5"
		>
			<MobileTitleHeader v-if="isMobile" class="min-w-0 flex-1" :title="__('Scheduled')" />
			<!-- -ml-0.5 cancels the crumb's own padding so the title sits on the px-5 axis -->
			<Breadcrumbs v-else :items="[{ label: __('Scheduled') }]" class="-ml-0.5" />
			<HeaderActions @reload-mails="scheduledMails.reload()" />
		</header>

		<div class="flex-1 overflow-y-auto px-3 py-2.5 sm:px-5">
			<ListView
				v-if="scheduledMails.data"
				class="flex-1"
				:columns="LIST_COLUMNS"
				:rows="rows"
				:options="listOptions"
				row-key="name"
			>
				<ListHeader />
				<ListRows>
					<template v-if="rows.length">
						<ListRow
							v-for="row in rows"
							:key="row.name"
							v-slot="{ column, item }"
							:row="row"
							class="hover:!bg-surface-gray-1"
						>
							<ListRowItem :item="item">
								<span v-if="column.key === 'recipients'" class="truncate">
									{{ recipientLabel(row) }}
								</span>
								<span v-else-if="column.key === 'subject'" class="truncate">
									{{ row.subject || __('(No subject)') }}
								</span>
								<div
									v-else-if="column.key === 'send_at'"
									class="flex w-full items-center justify-between gap-2"
								>
									<span class="truncate">
										{{ formatDateTime(row.send_at) }}
										<span class="text-ink-gray-5">({{ fromNow(row.send_at) }})</span>
									</span>
									<AdaptiveDropdown :options="rowOptions(row)" placement="bottom-end">
										<Button variant="ghost" @click.stop.prevent>
											<template #icon>
												<EllipsisVertical class="text-ink-gray-5 h-4 w-4" />
											</template>
										</Button>
									</AdaptiveDropdown>
								</div>
							</ListRowItem>
						</ListRow>
					</template>
					<ListEmptyState v-else />
				</ListRows>
			</ListView>
			<DashboardListSkeleton v-else :columns="3" />
		</div>

		<ScheduleSendModal
			v-model="showReschedule"
			:title="__('Reschedule delivery')"
			:initial-value="selected?.send_at"
			@confirm="(sendAt: string) => rescheduleMail.submit({ send_at: sendAt })"
		/>
		<Dialog v-model="showSendNow" :options="sendNowOptions" />
		<Dialog v-model="showCancel" :options="cancelOptions" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarClock, EllipsisVertical, SendHorizontal, X } from 'lucide-vue-next'
import {
	Breadcrumbs,
	Button,
	Dialog,
	ListEmptyState,
	ListHeader,
	ListRow,
	ListRowItem,
	ListRows,
	ListView,
	createResource,
	usePageMeta,
} from 'frappe-ui'

import { raiseToast } from '@/apps/mail/utils'
import { formatDateTime, fromNow } from '@/apps/mail/utils/datetime'
import { useScreenSize } from '@/apps/mail/utils/composables'
import { userStore } from '@/apps/mail/stores/user'
import AdaptiveDropdown from '@/apps/mail/components/AdaptiveDropdown.vue'
import DashboardListSkeleton from '@/apps/mail/components/DashboardListSkeleton.vue'
import HeaderActions from '@/apps/mail/components/HeaderActions.vue'
import MobileTitleHeader from '@/apps/mail/components/mobile/MobileTitleHeader.vue'
import ScheduleSendModal from '@/apps/mail/components/Modals/ScheduleSendModal.vue'

type ScheduledMail = {
	name: string
	id: string
	thread_id?: string
	subject?: string
	from_email?: string
	recipients: { type: string; email: string; display_name?: string }[]
	send_at: string
	submission_id?: string
	creation?: string
}

usePageMeta(() => ({ title: __('Scheduled') }))

const store = userStore()
const router = useRouter()
const { isMobile } = useScreenSize()

const selected = ref<ScheduledMail | null>(null)
const showReschedule = ref(false)
const showSendNow = ref(false)
const showCancel = ref(false)

const scheduledMails = createResource({
	url: 'suite.mail.api.mail.get_scheduled_mails',
	auto: true,
	makeParams: () => ({ account: store.accountId }),
	onError: (error: { message?: string }) =>
		raiseToast(error.message || __('Request failed.'), 'error'),
})

watch(
	() => store.accountId,
	() => store.accountId && scheduledMails.reload(),
)

const rows = computed<ScheduledMail[]>(() => scheduledMails.data || [])

const recipientLabel = (row: ScheduledMail) => {
	const emails = [
		...row.recipients.filter((r) => r.type === 'To'),
		...row.recipients.filter((r) => r.type !== 'To'),
	].map((r) => r.display_name || r.email)
	if (!emails.length) return '—'

	const [first, ...rest] = emails
	return rest.length ? `${first} +${rest.length}` : first
}

const LIST_COLUMNS = [
	{ label: __('To'), key: 'recipients' },
	{ label: __('Subject'), key: 'subject' },
	{ label: __('Scheduled for'), key: 'send_at' },
]

const listOptions = computed(() => ({
	showTooltip: false,
	selectable: false,
	rowHeight: 50,
	emptyState: {
		title: __('No scheduled emails'),
		description: __('Emails you schedule from the composer will wait here until they are sent.'),
	},
}))

const rowOptions = (row: ScheduledMail) => [
	{
		label: __('Send now'),
		icon: SendHorizontal,
		onClick: () => {
			selected.value = row
			showSendNow.value = true
		},
	},
	{
		label: __('Reschedule'),
		icon: CalendarClock,
		onClick: () => {
			selected.value = row
			showReschedule.value = true
		},
	},
	{
		label: __('Cancel delivery'),
		icon: X,
		theme: 'red',
		onClick: () => {
			selected.value = row
			showCancel.value = true
		},
	},
]

const openDrafts = () => {
	if (!store.mailboxIds.drafts) return
	router.push({
		name: 'mail-mailbox',
		params: { accountId: store.accountId, mailbox: store.mailboxIds.drafts },
	})
}

const onActionError = (error: { messages?: string[]; message?: string }) => {
	showSendNow.value = false
	showCancel.value = false
	raiseToast(error.messages?.[0] || error.message || __('Request failed.'), 'error')
	// The action may have failed because the email already went out; reflect the
	// reconciled state either way.
	scheduledMails.reload()
}

const rescheduleMail = createResource({
	url: 'suite.mail.api.mail.reschedule_mail',
	makeParams: ({ send_at }: { send_at: string }) => ({
		account: store.accountId,
		name: selected.value?.name,
		send_at,
	}),
	onSuccess: (data: { send_at: string }) => {
		scheduledMails.reload()
		raiseToast(__('Delivery rescheduled to {0}.', [formatDateTime(data.send_at)]))
	},
	onError: onActionError,
})

const sendNow = createResource({
	url: 'suite.mail.api.mail.send_scheduled_mail_now',
	makeParams: () => ({ account: store.accountId, name: selected.value?.name }),
	onSuccess: () => {
		showSendNow.value = false
		scheduledMails.reload()
		raiseToast(__('Message sent.'))
	},
	onError: onActionError,
})

const cancelSchedule = createResource({
	url: 'suite.mail.api.mail.cancel_scheduled_mail',
	makeParams: () => ({ account: store.accountId, name: selected.value?.name }),
	onSuccess: () => {
		showCancel.value = false
		scheduledMails.reload()
		raiseToast(
			__('Delivery cancelled. The message is back in your drafts.'),
			'success',
			store.mailboxIds.drafts
				? { label: __('Open Drafts'), onClick: openDrafts }
				: undefined,
		)
	},
	onError: onActionError,
})

const sendNowOptions = computed(() => ({
	title: __('Send Now'),
	message: __('Deliver this email immediately instead of at the scheduled time?'),
	actions: [
		{
			label: __('Send'),
			variant: 'solid',
			loading: sendNow.loading,
			onClick: sendNow.submit,
		},
	],
}))

const cancelOptions = computed(() => ({
	title: __('Cancel Delivery'),
	message: __('Cancel the scheduled delivery and move the message back to Drafts?'),
	icon: { name: 'alert-triangle', appearance: 'warning' },
	actions: [
		{
			label: __('Confirm'),
			variant: 'solid',
			theme: 'red',
			loading: cancelSchedule.loading,
			onClick: cancelSchedule.submit,
		},
	],
}))
</script>
