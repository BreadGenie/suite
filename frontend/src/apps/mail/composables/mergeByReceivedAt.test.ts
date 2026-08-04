import { describe, expect, it } from 'vitest'

import type { Thread } from '@/apps/mail/types'

import { mergeByReceivedAt } from './usePaginatedThreads'

// Only received_at and thread_id matter to the merge.
const thread = (thread_id: string, received_at: string) =>
	({ thread_id, received_at }) as unknown as Thread

const ids = (threads: Thread[]) => threads.map((t) => t.thread_id)

describe('mergeByReceivedAt', () => {
	it('prepends genuinely new mail', () => {
		const fresh = [thread('new', '2026-07-30 10:00:00')]
		const loaded = [thread('a', '2026-07-29 10:00:00'), thread('b', '2026-07-28 10:00:00')]
		expect(ids(mergeByReceivedAt(fresh, loaded))).toEqual(['new', 'a', 'b'])
	})

	// The All Inboxes case: a second account's newest mail is older than the first account's oldest
	// loaded row, so it belongs at the bottom — a prepend would open a stale date group above today's.
	it('sorts an older fresh thread below the loaded rows', () => {
		const fresh = [thread('old', '2026-07-26 10:00:00')]
		const loaded = [thread('a', '2026-07-30 10:00:00'), thread('b', '2026-07-29 10:00:00')]
		expect(ids(mergeByReceivedAt(fresh, loaded))).toEqual(['a', 'b', 'old'])
	})

	it('interleaves by date', () => {
		const fresh = [thread('f1', '2026-07-30 10:00:00'), thread('f2', '2026-07-28 10:00:00')]
		const loaded = [thread('l1', '2026-07-29 10:00:00'), thread('l2', '2026-07-27 10:00:00')]
		expect(ids(mergeByReceivedAt(fresh, loaded))).toEqual(['f1', 'l1', 'f2', 'l2'])
	})

	it('keeps the fresh row first on a tie', () => {
		const fresh = [thread('f', '2026-07-30 10:00:00')]
		const loaded = [thread('l', '2026-07-30 10:00:00')]
		expect(ids(mergeByReceivedAt(fresh, loaded))).toEqual(['f', 'l'])
	})

	it('handles either side being empty', () => {
		const rows = [thread('a', '2026-07-30 10:00:00')]
		expect(ids(mergeByReceivedAt([], rows))).toEqual(['a'])
		expect(ids(mergeByReceivedAt(rows, []))).toEqual(['a'])
		expect(mergeByReceivedAt([], [])).toEqual([])
	})
})
