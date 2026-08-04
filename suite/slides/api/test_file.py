# Copyright (c) 2024, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from frappe.tests import IntegrationTestCase
from werkzeug.exceptions import Forbidden

from suite.slides.api.file import validate_media_file
from suite.slides.tests.utils import make_presentation, make_private_image, make_public
from suite.tests.utils import ensure_user

OWNER = "media-owner@example.com"
OTHER_USER = "media-other@example.com"


class TestMediaFileAccess(IntegrationTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        ensure_user(OWNER)
        ensure_user(OTHER_USER)

        with cls.set_user(OWNER):
            cls.presentation = make_presentation("Media Access Test")
            cls.file = make_private_image(cls.presentation.name)

    def test_owner_can_access(self):
        with self.set_user(OWNER):
            self.assertIsNone(validate_media_file(self.file.file_url))

    def test_other_user_forbidden(self):
        with self.set_user(OTHER_USER):
            with self.assertRaises(Forbidden):
                validate_media_file(self.file.file_url)

    def test_guest_forbidden(self):
        with self.set_user("Guest"):
            with self.assertRaises(Forbidden):
                validate_media_file(self.file.file_url)

    def test_guest_can_access_file_of_public_presentation(self):
        # own fixtures: making the shared presentation public would break the deny tests
        with self.set_user(OWNER):
            presentation = make_presentation("Public Media Test")
            file = make_private_image(presentation.name)
            make_public(presentation.name)

        with self.set_user("Guest"):
            self.assertIsNone(validate_media_file(file.file_url))
