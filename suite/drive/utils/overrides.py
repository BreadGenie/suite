import frappe
from frappe.permissions import SYSTEM_USER_ROLE, get_doctypes_with_read

from suite.drive.api.permissions import get_teams


def filter_file(user=None):
	"""Replaces the framework's File query conditions (skipped because of the
	`ignore_file_permissions` hook): original framework semantics for site
	files, Drive access (membership, ownership, explicit permission) for team files."""
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if user == "Administrator" or "Drive Admin" in roles:
		return ""

	escaped = frappe.db.escape(user)
	site = "COALESCE(`tabFile`.`team`, '') = ''"
	docshare_cond = (
		f"`tabFile`.`name` IN (SELECT `share_name` FROM `tabDocShare`"
		f" WHERE `share_doctype` = 'File' AND `user` = {escaped} AND `read` = 1)"
	)
	if SYSTEM_USER_ROLE in roles:
		readable = ", ".join(frappe.db.escape(dt) for dt in get_doctypes_with_read(user)) or "''"
		site_cond = (
			f"({site} AND (`tabFile`.`is_private` = 0"
			f" OR (`tabFile`.`attached_to_doctype` IS NULL AND `tabFile`.`owner` = {escaped})"
			f" OR `tabFile`.`attached_to_doctype` IN ({readable})"
			f" OR {docshare_cond}))"
		)
	else:
		site_cond = (
			f"({site} AND (`tabFile`.`is_private` = 0 OR `tabFile`.`owner` = {escaped} OR {docshare_cond}))"
		)

	teams = get_teams(user, exclude_personal=False)
	team_cond = f"`tabFile`.`team` IN ({', '.join(frappe.db.escape(t) for t in teams)})" if teams else "1=0"
	drive_cond = (
		f"(NOT {site} AND ({team_cond}"
		f" OR `tabFile`.`owner` = {escaped}"
		f" OR `tabFile`.`name` IN (SELECT `entity` FROM `tabDrive Permission`"
		f" WHERE `user` = {escaped} AND `read` = 1)))"
	)
	return f"({site_cond} OR {drive_cond})"


def common_filters(func):
	def decorator(user):
		user = user or frappe.session.user
		if user == "Administrator" or "Drive Admin" in frappe.get_roles(user):
			return ""
		return func(user)

	return decorator


@common_filters
def filter_drive_permission(user):
	user = frappe.db.escape(user)
	return f"""(`tabDrive Permission`.`owner` = {user} or `tabDrive Permission`.user = {user})"""


@common_filters
def filter_drive_team(user):
	teams = get_teams(user, exclude_personal=False)
	member = (
		f"`tabDrive Team`.name in ({', '.join(frappe.db.escape(team) for team in teams)}) or "
		if teams
		else ""
	)
	return f"({member}`tabDrive Team`.public = 1)"


@common_filters
def filter_drive_favourite(user):
	return f"""(`tabDrive Favourite`.`user` = {frappe.db.escape(user)})"""


@common_filters
def filter_drive_recent(user):
	return f"""(`tabDrive Entity Log`.`user` = {frappe.db.escape(user)})"""


@common_filters
def filter_drive_notif(user):
	user = frappe.db.escape(user)
	return f"(`tabDrive Notification`.to_user = {user} or `tabDrive Notification`.from_user = {user})"
