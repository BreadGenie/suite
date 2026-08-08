// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Mail Queue', {
	refresh(frm) {
		if (!frm.doc.__islocal) {
			frm.disable_save()
			frm.trigger('add_comments')
			frm.trigger('add_actions')
		}
	},

	user(frm) {
		frm.set_value('account', null)
	},

	add_comments(frm) {
		if (
			!frm.doc.__islocal &&
			['Failed to Draft', 'Failed to Submit'].includes(frm.doc.status) &&
			frm.doc.error_message
		) {
			frm.dashboard.add_comment(__(frm.doc.error_message), 'red', true)
		}
	},

	add_actions(frm) {
		if (!frappe.user_roles.includes('System Manager')) return

		if (['Failed', 'Failed to Draft', 'Failed to Submit'].includes(frm.doc.status)) {
			frm.add_custom_button(__('Retry'), () => frm.trigger('retry'), __('Actions'))
		}

		if (frm.doc.status === 'Scheduled') {
			frm.add_custom_button(__('Send Now'), () => frm.trigger('send_now'), __('Actions'))
			frm.add_custom_button(__('Reschedule'), () => frm.trigger('reschedule'), __('Actions'))
			frm.add_custom_button(
				__('Cancel Schedule'),
				() => frm.trigger('cancel_schedule'),
				__('Actions'),
			)
		}

		if (
			frm.doc.blob_id &&
			!frm.doc.message &&
			(frm.doc.save_as_draft || !frm.doc.destroy_after_submit)
		) {
			frm.add_custom_button(
				__('Load MIME Message'),
				() => frm.trigger('get_mime_message'),
				__('Actions'),
			)
		}
	},

	send_now(frm) {
		frappe.confirm(__('Deliver this scheduled email immediately?'), () => {
			frappe.call({
				doc: frm.doc,
				method: 'send_now',
				freeze: true,
				freeze_message: __('Sending...'),
				callback: (r) => {
					if (!r.exc) {
						frm.reload_doc()
					}
				},
			})
		})
	},

	reschedule(frm) {
		frappe.prompt(
			{
				label: __('Send At'),
				fieldname: 'send_at',
				fieldtype: 'Datetime',
				reqd: 1,
				default: frm.doc.send_at,
			},
			(values) => {
				frappe.call({
					doc: frm.doc,
					method: 'reschedule',
					args: { send_at: values.send_at },
					freeze: true,
					freeze_message: __('Rescheduling...'),
					callback: (r) => {
						if (!r.exc) {
							frm.reload_doc()
						}
					},
				})
			},
			__('Reschedule Delivery'),
		)
	},

	cancel_schedule(frm) {
		frappe.confirm(
			__('Cancel delivery and move the message back to Drafts? This cannot be undone.'),
			() => {
				frappe.call({
					doc: frm.doc,
					method: 'cancel_schedule',
					freeze: true,
					freeze_message: __('Cancelling...'),
					callback: (r) => {
						if (!r.exc) {
							frm.reload_doc()
						}
					},
				})
			},
		)
	},

	retry(frm) {
		frappe.call({
			doc: frm.doc,
			method: 'retry',
			freeze: true,
			freeze_message: __('Retrying...'),
			callback: (r) => {
				if (!r.exc) {
					frm.refresh()
				}
			},
		})
	},

	get_mime_message(frm) {
		frappe.call({
			doc: frm.doc,
			method: 'get_mime_message',
			freeze: true,
			freeze_message: __('Loading MIME Message...'),
			callback: (r) => {
				if (!r.exc) {
					frm.refresh()
				}
			},
		})
	},
})
