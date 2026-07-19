import frappe

from suite.drive.utils import create_drive_file, get_home_folder


def execute():
	"""Back presentations with Drive Files; move the legacy `is_public` flag to Drive permissions."""
	public = set()
	if frappe.db.has_column("Presentation", "is_public"):
		public = set(frappe.db.sql_list("SELECT name FROM `tabPresentation` WHERE is_public = 1"))

	frappe.flags.mute_drive_activity_log = True
	try:
		presentations = frappe.get_all(
			"Presentation",
			filters={"is_template": 0},
			fields=["name", "title", "owner"],
		)
		for presentation in presentations:
			file = frappe.db.get_value(
				"File",
				{"content_doctype": "Presentation", "content_docname": presentation.name},
				"name",
			)
			if not file:
				team = frappe.db.get_value("Drive Team", {"owner": presentation.owner, "personal": 1}, "name")
				if not team:
					frappe.log_error(
						title="Presentation left unbacked by Drive File",
						message=(
							f"Presentation {presentation.name} (owner {presentation.owner}) has no personal "
							f"Drive Team, so no Drive File was created. "
							f"is_public was {'1' if presentation.name in public else '0'}; "
							f"public presentations here lose public access and need manual remediation."
						),
					)
					continue
				file = create_drive_file(
					team,
					presentation.title or "Untitled",
					get_home_folder(team).name,
					"Presentation",
					None,
					mime_type="frappe/slides",
					content_doctype="Presentation",
					content_docname=presentation.name,
					owner=presentation.owner,
				).name

			if presentation.name in public and not frappe.db.exists(
				"Drive Permission", {"entity": file, "user": ""}
			):
				frappe.get_doc({"doctype": "Drive Permission", "entity": file, "user": "", "read": 1}).insert(
					ignore_permissions=True
				)
	finally:
		frappe.flags.mute_drive_activity_log = False
