from suite.mail.search import rebuild_all_email_address_indexes


def execute() -> None:
	"""Build the email-address search index from data already cached for each JMAP account.

	The index is new, so existing caches predate it. This fans the accounts out into long-queue
	background jobs (rather than indexing inline during migrate), each rebuilding from the cache.
	"""

	rebuild_all_email_address_indexes()
