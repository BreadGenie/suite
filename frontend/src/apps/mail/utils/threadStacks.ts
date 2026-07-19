import dayjs from '@/apps/mail/utils/dayjs'

import type { Thread } from '@/apps/mail/types'

// Chatty automated senders (uptime alerts, CI, ticket systems) post runs of threads that bury
// everything around them. A run of this many adjacent threads from one sender collapses into a single
// stack row. Two in a row is normal correspondence, not a flood — hence three.
const MIN_STACK_SIZE = 3

/**
 * The stack identity of a thread, or null when it must never stack.
 *
 * Stacking keys on the SENDER, not the subject. Matching subjects too was tried and measured against a
 * real 300-thread inbox, and the two classes turned out not to be separable: "Outbound IP Change — KSA
 * Region" vs "… Johannesburg Region" (one template, must stack) scored 0.71 similarity, while "Your CRM
 * trial just expired" vs "Your Learning trial just expired" (distinct notices, must not stack) scored
 * 0.74 — higher. Any threshold loose enough to catch the real floods admits everything from a sender
 * anyway, which is this rule with extra machinery. So: one sender, one day, three in a row.
 *
 * `account` is part of the key because the merged all-accounts search view can place two accounts' rows
 * adjacent: the same sender writing to two of my accounts is two piles, not one.
 *
 * The `received_at` day is part of the key so a stack never spans more than one calendar day, even when
 * the user groups by Month (or not at all) and the enclosing date bucket is far wider. Putting the day
 * here rather than pre-bucketing in the caller means run detection needs no date awareness: two
 * adjacent threads from different days simply get different keys and the run flushes at midnight.
 */
export const stackKeyOf = (thread: Thread): string | null => {
	const from = (thread.from_email ?? '').trim().toLowerCase()
	if (!from) return null

	const day = dayjs(thread.received_at).format('YYYY-MM-DD')
	return `${thread.account ?? ''}|${day}|${from}`
}

interface ThreadRow {
	type: 'thread'
	key: string
	thread: Thread
	// Set on the members of an expanded stack, which the list indents so the run still reads as one
	// unit. They are emitted as siblings of their stack row rather than nested inside it, so the list
	// template keeps a single MailListItem branch for every thread row, stacked or not.
	inStack?: boolean
}

export interface StackRow {
	type: 'stack'
	key: string
	threads: Thread[]
	expanded: boolean
}

// One rendered row. An expanded stack contributes its stack row followed by a ThreadRow per member.
export type ListRow = ThreadRow | StackRow

/**
 * Collapses maximal runs of >= MIN_STACK_SIZE adjacent threads sharing a stack key into one stack row,
 * preserving list order.
 *
 * Call this per date group: the caller's slice is the boundary a run can never cross (the day component
 * of the stack key caps it at a calendar day besides).
 */
export const buildListRows = (
	threads: Thread[],
	options: {
		rowKey: (thread: Thread) => string
		isExpanded: (run: Thread[]) => boolean
		enabled?: boolean
	},
): ListRow[] => {
	const { rowKey, isExpanded, enabled = true } = options
	const rows: ListRow[] = []

	const pushThreads = (run: Thread[], inStack = false) => {
		for (const thread of run) rows.push({ type: 'thread', key: rowKey(thread), thread, inStack })
	}

	const flush = (run: Thread[]) => {
		if (!run.length) return

		if (!enabled || run.length < MIN_STACK_SIZE) return pushThreads(run)

		// Keyed by the run's first row, which is stable while the run grows downwards (the common case:
		// infinite scroll appending older mail). Expansion state is tracked separately, by member id, so
		// a key change on a refresh-prepend costs nothing.
		const expanded = isExpanded(run)
		rows.push({ type: 'stack', key: `stack:${rowKey(run[0])}`, threads: run, expanded })
		if (expanded) pushThreads(run, true)
	}

	let run: Thread[] = []
	let runKey: string | null = null

	for (const thread of threads) {
		const key = stackKeyOf(thread)
		// A null key never matches, so senderless threads always flush on their own and never merge
		// with each other.
		if (key && key === runKey) {
			run.push(thread)
			continue
		}

		flush(run)
		run = [thread]
		runKey = key
	}
	flush(run)

	return rows
}
