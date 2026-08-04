# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class DriveDiskSettings(Document):
    def validate(self):
        # A mirrored tree on S3 means a folder move copies and deletes every object
        # under it, which times out on large folders.
        if self.enabled:
            self.flat = 1

    def __getattribute__(self, attr):
        """
        We want explicit denial of , so require '/' at the DB level.
        However, this causes a lot of problems with `Path`, so override empty prefixes.
        """
        val = object.__getattribute__(self, attr)
        if attr == "root_folder":
            return val if val and val != "/" else ""
        return val
