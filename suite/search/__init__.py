import os
import shutil
from urllib.parse import quote

import frappe
from frappe.utils import get_bench_path


def get_search_base_path() -> str:
	"""Base directory holding every Tantivy search index for the current site.

	Sits alongside the site's private files, so it is per-site (multi-tenant safe) and never web-served.
	"""

	return os.path.join(get_bench_path(), "sites", frappe.local.site, "private", "files", "search-index")


def destroy_search_indexes(key: str) -> None:
	"""Delete every search index belonging to `key` (e.g. a JMAP account) across all entities.

	Indexes live at ``<base>/<key>/<entity>``, so removing the key's directory clears all of its
	indexes at once, including any left behind by older schemas.
	"""

	key_path = os.path.join(get_search_base_path(), quote(key, safe=""))
	if os.path.isdir(key_path):
		shutil.rmtree(key_path, ignore_errors=True)


@frappe.whitelist()
def destroy_search_index() -> None:
	"""Delete every search index for the current site. System Manager only."""

	from suite.utils.user import is_system_manager

	if not is_system_manager(frappe.session.user):
		frappe.throw(frappe._("Only System Manager can destroy the search index."))

	base_path = get_search_base_path()
	if os.path.exists(base_path):
		shutil.rmtree(base_path)
