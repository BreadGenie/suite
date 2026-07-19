import { describe, expect, it } from 'vitest'

import { buildListRows, stackKeyOf } from './threadStacks'

import type { Thread } from '@/apps/mail/types'

const thread = (overrides: Partial<Thread> = {}): Thread =>
	({
		name: 'm1',
		account: 'acc1',
		thread_id: 't1',
		from_email: 'alerts@uptimerobot.com',
		from_name: 'UptimeRobot',
		subject: 'Monitor is UP: preview.frappe.cloud/',
		received_at: '2026-07-16 10:00:00',
		seen: 0,
		...overrides,
	}) as Thread

// A run of adjacent threads that differ the way a real notification burst does: distinct ids, distinct
// times within the same day.
const run = (count: number, overrides: Partial<Thread> = {}) =>
	Array.from({ length: count }, (_, i) =>
		thread({
			name: `m${i}`,
			thread_id: `t${i}`,
			received_at: `2026-07-16 1${i}:00:00`,
			...overrides,
		}),
	)

const rowOptions = { rowKey: (t: Thread) => t.name, isExpanded: () => false }

describe('stackKeyOf', () => {
	it('ignores the subject entirely — one sender, one day, one pile', () => {
		expect(stackKeyOf(thread({ subject: 'Monitor is UP: preview.frappe.cloud/' }))).toBe(
			stackKeyOf(thread({ subject: 'Monitor is DOWN: preview.frappe.cloud/' })),
		)
		// Even wholly unrelated subjects from the same sender share a key: the accepted cost of the
		// sender rule, paid back by the count badge and one click to expand.
		expect(stackKeyOf(thread({ subject: '[PyPI] Unrecognized login to your PyPI account' }))).toBe(
			stackKeyOf(thread({ subject: '[PyPI] Trusted publisher created project frappectl' })),
		)
		expect(stackKeyOf(thread({ subject: null }))).toBe(stackKeyOf(thread({ subject: 'anything' })))
	})

	it('separates different senders', () => {
		expect(stackKeyOf(thread({ from_email: 'a@x.com' }))).not.toBe(
			stackKeyOf(thread({ from_email: 'b@x.com' })),
		)
	})

	it('is case- and whitespace-insensitive about the sender', () => {
		expect(stackKeyOf(thread({ from_email: '  Alerts@UptimeRobot.com ' }))).toBe(
			stackKeyOf(thread({ from_email: 'alerts@uptimerobot.com' })),
		)
	})

	it('returns null without a sender, so such threads never stack', () => {
		expect(stackKeyOf(thread({ from_email: '' }))).toBeNull()
	})

	it('separates the same sender across accounts', () => {
		expect(stackKeyOf(thread({ account: 'acc1' }))).not.toBe(
			stackKeyOf(thread({ account: 'acc2' })),
		)
	})

	it('separates the same sender across calendar days', () => {
		expect(stackKeyOf(thread({ received_at: '2026-07-16 23:59:00' }))).not.toBe(
			stackKeyOf(thread({ received_at: '2026-07-17 00:01:00' })),
		)
	})
})

describe('buildListRows', () => {
	it('leaves a run of two as ordinary rows', () => {
		expect(buildListRows(run(2), rowOptions).map((r) => r.type)).toEqual(['thread', 'thread'])
	})

	it('collapses a run of three into one stack', () => {
		const rows = buildListRows(run(3), rowOptions)
		expect(rows).toHaveLength(1)
		expect(rows[0].type).toBe('stack')
		expect(rows[0].type === 'stack' && rows[0].threads).toHaveLength(3)
	})

	it('collapses a flapping monitor regardless of the subjects', () => {
		const flap = ['UP', 'DOWN', 'UP', 'DOWN'].map((state, i) =>
			thread({ name: `m${i}`, subject: `Monitor is ${state}: preview.frappe.cloud/` }),
		)
		const rows = buildListRows(flap, rowOptions)
		expect(rows).toHaveLength(1)
		expect(rows[0].type === 'stack' && rows[0].threads).toHaveLength(4)
	})

	it('breaks a run at a different sender and preserves order', () => {
		const [a, b, c, d] = run(4)
		const other = thread({ name: 'other', from_email: 'hey@posthog.com' })
		const rows = buildListRows([a, b, other, c, d], rowOptions)
		expect(rows.map((r) => r.type)).toEqual(['thread', 'thread', 'thread', 'thread', 'thread'])
		expect(rows.map((r) => r.key)).toEqual(['m0', 'm1', 'other', 'm2', 'm3'])
	})

	it('splits a run that crosses midnight into per-day stacks', () => {
		const day1 = run(3).map((t) => ({ ...t, received_at: '2026-07-16 10:00:00' }))
		const day2 = run(3).map((t, i) => ({ ...t, name: `n${i}`, received_at: '2026-07-17 10:00:00' }))
		expect(buildListRows([...day2, ...day1], rowOptions).map((r) => r.type)).toEqual([
			'stack',
			'stack',
		])
	})

	it('never merges senderless threads with each other', () => {
		const rows = buildListRows(run(3, { from_email: '' }), rowOptions)
		expect(rows.map((r) => r.type)).toEqual(['thread', 'thread', 'thread'])
	})

	it('renders plain rows when disabled', () => {
		const rows = buildListRows(run(5), { ...rowOptions, enabled: false })
		expect(rows).toHaveLength(5)
		expect(rows.every((r) => r.type === 'thread')).toBe(true)
	})

	it('emits an expanded stack as a stack row followed by its members', () => {
		const rows = buildListRows(run(3), { ...rowOptions, isExpanded: () => true })
		expect(rows.map((r) => r.type)).toEqual(['stack', 'thread', 'thread', 'thread'])
		expect(rows[0].type === 'stack' && rows[0].expanded).toBe(true)
		// The members are marked so the list can indent them.
		expect(rows.slice(1).every((r) => r.type === 'thread' && r.inStack)).toBe(true)
	})

	it('marks only stack members as inStack, so ordinary rows are never indented', () => {
		const rows = buildListRows(run(2), rowOptions)
		expect(rows.every((r) => r.type === 'thread' && !r.inStack)).toBe(true)
	})

	it('detects runs that sit at either end of the list', () => {
		const other = thread({ name: 'other', from_email: 'hey@posthog.com' })
		expect(buildListRows([...run(3), other], rowOptions).map((r) => r.type)).toEqual([
			'stack',
			'thread',
		])
		expect(buildListRows([other, ...run(3)], rowOptions).map((r) => r.type)).toEqual([
			'thread',
			'stack',
		])
	})
})
