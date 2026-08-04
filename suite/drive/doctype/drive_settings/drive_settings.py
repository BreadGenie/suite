# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

PRIVILEGED_FIELDS = ("quota", "user_folder")


class DriveSettings(Document):
    def validate(self):
        if self.flags.ignore_permissions or frappe.session.user == "Administrator":
            return
        if "Suite Admin" in frappe.get_roles():
            return

        before = self.get_doc_before_save()
        for field in PRIVILEGED_FIELDS:
            previous = before.get(field) if before else None
            if (self.get(field) or None) != (previous or None):
                frappe.throw(f"{field} is managed by Drive.", frappe.PermissionError)
