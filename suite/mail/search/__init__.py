import frappe
from frappe import _
from frappe.utils import create_batch

from suite.mail.search.indexes import EmailAddressIndex
from suite.utils import enqueue_job

# Cached records processed per index write while rebuilding, bounding memory and commit size.
_REBUILD_BATCH_SIZE = 500

# Accounts rebuilt per long-queue job when rebuilding every account's index.
_ACCOUNTS_PER_REBUILD_BATCH = 25


def get_email_address_index(account: str) -> EmailAddressIndex:
	"""Get the EmailAddressIndex for the given JMAP account ID."""

	return EmailAddressIndex(account)


def rebuild_email_address_index(account: str, in_background: bool = True) -> None:
	"""Rebuild an account's email-address index from scratch.

	Drops the existing index, then re-indexes every cached mail message and contact card in
	batches (bounding memory and the size of each index commit). Runs in a background job by
	default; pass `in_background=False` to run inline (e.g. from within the job itself).
	"""

	if in_background:
		enqueue_job(
			rebuild_email_address_index,
			job_id=f"rebuild-email-address-index::{account}",
			deduplicate=True,
			queue="long",
			timeout=3600,
			account=account,
			in_background=False,
		)
		return

	# Imported lazily: these modules import this package, so a top-level import would be circular.
	from suite.mail.doctype.contact_card.contact_card import _contact_addresses
	from suite.mail.doctype.mail_message.mail_message import _message_addresses
	from suite.mail.storage import get_data_store
	from suite.mail.storage.data_store import Entity

	# Drop the stale index, then take a fresh handle so its directory is recreated before writing.
	get_email_address_index(account).drop()
	index = get_email_address_index(account)

	store = get_data_store(account)

	messages = list(store.scan(Entity.EMAIL).values())
	for batch in create_batch(messages, _REBUILD_BATCH_SIZE):
		index.index_addresses(_message_addresses(batch))

	contact_cards = list(store.scan(Entity.CONTACT_CARD).values())
	for batch in create_batch(contact_cards, _REBUILD_BATCH_SIZE):
		index.index_addresses(_contact_addresses(batch))


@frappe.whitelist()
def rebuild_all_email_address_indexes() -> None:
	"""Rebuild the email-address index for every JMAP account. System Manager only.

	Fans the accounts out into long-queue background jobs of `_ACCOUNTS_PER_REBUILD_BATCH` each;
	every job rebuilds its accounts inline. Safe to run from a scheduler or the console.
	"""

	from suite.utils.user import is_system_manager

	if not is_system_manager(frappe.session.user):
		frappe.throw(_("Only System Manager can rebuild the email address indexes."))

	accounts = frappe.db.get_all("JMAP Account", {}, pluck="name")
	for i, batch in enumerate(create_batch(accounts, _ACCOUNTS_PER_REBUILD_BATCH)):
		enqueue_job(
			_rebuild_email_address_indexes,
			job_id=f"rebuild-email-address-indexes::{i}",
			deduplicate=True,
			queue="long",
			timeout=3600,
			accounts=batch,
		)


def _rebuild_email_address_indexes(accounts: list[str]) -> None:
	"""Rebuild each account's email-address index inline, isolating per-account failures."""

	from suite.mail.utils import log_mail_error

	for account in accounts:
		try:
			rebuild_email_address_index(account, in_background=False)
		except Exception:
			log_mail_error(
				_("Failed to rebuild email address index for account {0}").format(account),
				frappe.get_traceback(with_context=True),
			)
