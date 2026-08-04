<template>
	<div
		v-if="invite"
		class="text-ink-gray-6 mb-3 flex flex-col gap-3 rounded border p-2.5 px-4 sm:flex-row sm:items-center"
	>
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<CalendarPlus class="h-4.5 w-4.5 shrink-0 stroke-1.5" />
			<div class="min-w-0 flex-1">
				<span class="text-ink-gray-8 block truncate">
					{{ invite.event.title || __('Untitled event') }}
				</span>
				<span v-if="whenLabel" class="block truncate">{{ whenLabel }}</span>
				<span v-if="locationLabel" class="block truncate">{{ locationLabel }}</span>
			</div>
		</div>
		<div class="flex shrink-0 items-center justify-end gap-3">
			<template v-if="invite.participant">
				<span>{{ __('Going?') }}</span>
				<div class="flex items-center gap-1.5">
					<Button
						v-for="option in RSVP_OPTIONS"
						:key="option.value"
						:label="option.label"
						:variant="currentResponse === option.value ? 'solid' : 'outline'"
						:loading="rsvp.loading && pendingResponse === option.value"
						@click="handleRsvp(option.value)"
					/>
				</div>
			</template>
			<Button
				v-else-if="!invite.exists"
				:label="__('Add to Calendar')"
				:loading="addInvite.loading"
				@click="addInvite.submit()"
			/>
			<Button
				v-else
				variant="outline"
				:label="__('View in Calendar')"
				@click="viewInCalendar"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarPlus } from 'lucide-vue-next'
import { Button, createResource } from 'frappe-ui'

import dayjs from '@/apps/calendar/utils/dayjs'
import { eventDayRoute, useUpcomingEvents } from '@/apps/mail/composables/useUpcomingEvents'
import { raiseToast } from '@/apps/mail/utils'

import type { Attachment } from '@/apps/mail/types'

// The slice of the formatted calendar event the banner reads; the full shape comes from the
// backend's format_calendar_event, identical for a parsed preview and an existing event.
interface InviteEvent {
	id: string
	title: string
	start: string
	duration: string
	time_zone: string
	show_without_time: 0 | 1
	recurrence_id?: string | null
	locations: { _name?: string }[]
}

interface InviteDetails {
	uid: string
	method: string
	exists: boolean
	event: InviteEvent
	// The viewer's own entry on the event — present when they're invited, carrying their
	// current response (e.g. 'ACCEPTED', or '' when they haven't answered yet).
	participant: { uid: string; email: string; status: string } | null
}

const { attachment, account } = defineProps<{ attachment: Attachment; account: string }>()

const router = useRouter()

const details = createResource({
	url: 'suite.calendar.api.invites.get_invite_details',
	params: { account, blob_id: attachment.blob_id },
	auto: true,
})

// Only an invitation (or a plain published event) is addable — a cancellation or an attendee's
// reply also travels as text/calendar, and a banner offering to add those would be nonsense.
const invite = computed<InviteDetails | null>(() => {
	const data = details.data
	if (!data?.event) return null
	if (data.method && !['request', 'publish'].includes(data.method)) return null
	return data
})

// JSCalendar start/duration are a wall clock in the event's own zone; render them in the
// reader's, mirroring the calendar app (see @/apps/calendar/utils/datetime).
const localZone = () => dayjs.tz?.guess?.() || Intl.DateTimeFormat().resolvedOptions().timeZone

const whenLabel = computed(() => {
	const event = invite.value?.event
	if (!event?.start) return ''

	const start = event.time_zone
		? dayjs.tz(event.start, event.time_zone).tz(localZone())
		: dayjs(event.start)
	if (event.show_without_time) return start.format('dddd, MMM D, YYYY')

	const end = start.add(dayjs.duration(event.duration || 'PT0S'))
	if (end.isSame(start, 'day'))
		return `${start.format('dddd, MMM D, YYYY ⋅ h:mm A')} – ${end.format('h:mm A')}`
	return `${start.format('MMM D, YYYY, h:mm A')} – ${end.format('MMM D, YYYY, h:mm A')}`
})

const locationLabel = computed(() =>
	(invite.value?.event.locations || [])
		.map((location) => location._name)
		.filter(Boolean)
		.join(', '),
)

const addInvite = createResource({
	url: 'suite.calendar.api.invites.add_invite_to_calendar',
	makeParams: () => ({ account, blob_id: attachment.blob_id }),
	onSuccess: (event: InviteEvent) => {
		// Flip to the "added" state with the created copy (which has the id the deep link needs)
		// instead of refetching — the server's uid index updates asynchronously, so an immediate
		// refetch could still report the event as missing.
		details.data = { ...details.data, exists: true, event }
		raiseToast(__('Event added to your calendar.'))
		useUpcomingEvents().events.reload()
	},
	onError: (error: { message?: string }) => raiseToast(error.message || '', 'error'),
})

// --- RSVP (mirrors the calendar app's "Going?" control) ---

const RSVP_OPTIONS = [
	{ label: __('Yes'), value: 'ACCEPTED' },
	{ label: __('No'), value: 'DECLINED' },
	{ label: __('Maybe'), value: 'TENTATIVE' },
]

const currentResponse = computed(() => invite.value?.participant?.status || '')
const pendingResponse = ref('')

const rsvp = createResource({
	url: 'suite.calendar.api.invites.rsvp_to_invite',
	makeParams: (response: string) => ({ account, blob_id: attachment.blob_id, response }),
	onSuccess: (event: InviteEvent) => {
		details.data = {
			...details.data,
			exists: true,
			event,
			participant: { ...details.data.participant, status: pendingResponse.value },
		}
		raiseToast(__('Response sent.'))
		useUpcomingEvents().events.reload()
	},
	onError: (error: { message?: string }) => raiseToast(error.message || '', 'error'),
})

const handleRsvp = (response: string) => {
	if (rsvp.loading || response === currentResponse.value) return
	pendingResponse.value = response
	rsvp.submit(response.toLowerCase())
}

const viewInCalendar = () => {
	const event = invite.value?.event
	if (event?.id) router.push(eventDayRoute(event, account))
}
</script>
