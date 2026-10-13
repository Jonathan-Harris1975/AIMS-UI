import importlib
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import native_auto_merge


class NativeAutoMergeTests(unittest.TestCase):
    def test_import_without_credentials_does_not_raise_key_error(self):
        env = os.environ.copy()
        env.pop("NATIVE_MERGE_TOKEN", None)
        env.pop("REPO", None)
        env["PYTHONPATH"] = ".github/scripts"
        result = subprocess.run(
            [sys.executable, "-c", "import native_auto_merge"],
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_main_fails_clearly_when_credentials_are_missing(self):
        with patch.object(native_auto_merge, "REPO", ""), patch.object(
            native_auto_merge, "TOKEN", ""
        ):
            with self.assertRaisesRegex(RuntimeError, "REPO and NATIVE_MERGE_TOKEN are required"):
                native_auto_merge.main()

    def test_page_url_handles_existing_query_and_trailing_separator(self):
        self.assertEqual(
            native_auto_merge.page_url("/repos/acme/app/pulls?state=open", 2),
            "/repos/acme/app/pulls?state=open&per_page=100&page=2",
        )
        self.assertEqual(
            native_auto_merge.page_url("/repos/acme/app/pulls?state=open&", 2),
            "/repos/acme/app/pulls?state=open&per_page=100&page=2",
        )
        self.assertEqual(
            native_auto_merge.page_url("/repos/acme/app/pulls?", 2),
            "/repos/acme/app/pulls?per_page=100&page=2",
        )

    def test_owner_login_is_derived_from_repository(self):
        with patch.dict(os.environ, {"REPO": "example-owner/MAST"}):
            module = importlib.reload(native_auto_merge)
            self.assertEqual(module.REPO_OWNER, "example-owner")
            self.assertEqual(module.REPO_NAME, "mast")
        importlib.reload(native_auto_merge)

    def test_owner_approval_matches_derived_owner_and_exact_sha(self):
        sha = "a" * 40
        approved = {
            "user": {"login": "example-owner"},
            "state": "APPROVED",
            "commit_id": sha,
            "submitted_at": "2026-10-13T12:00:00Z",
        }
        with patch.object(native_auto_merge, "REPO_OWNER", "example-owner"), patch.object(
            native_auto_merge, "pages", return_value=[approved]
        ):
            self.assertTrue(native_auto_merge.mast_owner_approval(7, sha))
            self.assertFalse(native_auto_merge.mast_owner_approval(7, "b" * 40))


if __name__ == "__main__":
    unittest.main()
