from dataclasses import dataclass

import frappe
from frappe import _

from suite.mail.stalwart.service import ManagementService


@dataclass
class MailingList:
    name: str
    domain_id: str
    recipients: list[str] | None = None
    description: str | None = None

    def to_dict(self) -> dict:
        """Serializes the mailing list to the JMAP wire format.

        ``recipients`` is a set-valued map keyed by recipient email address — internal or
        external (omitted when empty).
        """

        payload = {"name": self.name, "domainId": self.domain_id, "description": self.description}
        if self.recipients:
            payload["recipients"] = {email: True for email in self.recipients}

        return payload


class MailingListService(ManagementService):
    type = "MailingList"
    default_properties = ["id", "name", "emailAddress", "domainId", "recipients", "description"]

    def get_by_name(
        self, name: str, properties: list[str] | None = None, raise_exception: bool = True
    ) -> dict | None:
        """Returns the mailing list with the given name, or ``None`` (throws if ``raise_exception``)."""

        mailing_list = self.find({"name": name}, properties=properties or ["id"])
        if not mailing_list and raise_exception:
            frappe.throw(_("Mailing list {0} not found on the Stalwart server.").format(name))

        return mailing_list
