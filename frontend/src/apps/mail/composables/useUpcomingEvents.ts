import { effectScope, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'

import dayjs from '@/apps/calendar/utils/dayjs'
import { userStore as calendarUserStore } from '@/apps/calendar/stores/user'
import { userStore } from '@/apps/mail/stores/user'

// Module singletons: the sidebar widget renders the list while DefaultLayout
// hosts the detail sidebar, so both need the same resource and selection.
const selectedEvent = ref<any>(null)
let events: any = null

const timezone = () => dayjs.tz?.guess?.() || Intl.DateTimeFormat().resolvedOptions().timeZone

// The detail sidebar's "delete following instances" path reads `date` (the
// clicked instance's day, attached by the calendar grid in the calendar app);
// derive it from the instance start here.
const withInstanceDate = (event: any) => ({
	...event,
	date: dayjs(event.start).format('YYYY-MM-DD'),
})

const openEvent = (event: any) => (selectedEvent.value = withInstanceDate(event))

export function useUpcomingEvents() {
	if (!events) {
		// Detached scope: the resource and watchers must outlive whichever
		// component happened to touch the composable first.
		effectScope(true).run(() => {
			const store = userStore()

			events = createResource({
				url: 'suite.calendar.api.get_calendar_events',
				makeParams: () => ({
					account: store.accountId,
					from_date: dayjs().startOf('day').format('YYYY-MM-DD[T]HH:mm:ss'),
					to_date: dayjs().endOf('day').format('YYYY-MM-DD[T]HH:mm:ss'),
					time_zone: timezone(),
				}),
			})

			// The layout's setup can run before the user resource has resolved an
			// account, so fetch on accountId becoming available, not on creation.
			watch(
				() => store.accountId,
				(id) => {
					selectedEvent.value = null
					if (id) events.reload()
				},
				{ immediate: true },
			)

			// The detail sidebar reads RSVP identity from the calendar app's user
			// store; initialize it on first open rather than on every mail load.
			watch(selectedEvent, (event) => event && calendarUserStore())

			// Keep the detail sidebar in sync after edits/RSVPs (mirrors
			// CalendarView): swap in the fresh copy of the selected event, or close
			// it if the event no longer exists.
			watch(
				() => events.data,
				(data) => {
					if (!selectedEvent.value || !data) return
					const fresh = data.find(
						(e: any) =>
							e.id === selectedEvent.value.id &&
							e.recurrence_id === selectedEvent.value.recurrence_id,
					)
					selectedEvent.value = fresh ? withInstanceDate(fresh) : null
				},
			)
		})
	}

	return { events, selectedEvent, openEvent }
}

// Day view of the calendar app on the event's start date (1-indexed month),
// deep-linked to the event itself (?event=) so its detail sidebar opens on
// arrival. Callers can layer `edit: '1'` onto the query for the edit modal.
// By PATH, not route name: the suite router registers each app's routes
// lazily on the first navigation into its prefix, so a named push from mail
// finds no match until the calendar has been visited — and silently no-ops.
export const eventDayRoute = (event: any, accountId: string) => {
	const start = dayjs(event.start)
	const day = `${start.year()}/${start.month() + 1}/${start.date()}`
	return {
		path: `/calendar/account/${encodeURIComponent(accountId)}/day/${day}`,
		query: { event: event.id, recurrence: event.recurrence_id || undefined },
	}
}
