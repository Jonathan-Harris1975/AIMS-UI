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

    def test_page_url_handles_existing_query_and_trailing_separators(self):
        cases = [
            (
                "/repos/acme/app/pulls?state=open",
                "/repos/acme/app/pulls?state=open&per_page=100&page=2",
            ),
            (
                "/repos/acme/app/pulls?state=open&",
                "/repos/acme/app/pulls?state=open&per_page=100&page=2",
            ),
            (
                "/repos/acme/app/pulls?",
                "/repos/acme/app/pulls?per_page=100&page=2",
            ),
        ]
        for path, expected in cases:
            with self.subTest(path=path):
                self.assertEqual(native_auto_merge.page_url(path, 2), expected)

    def test_exact_admission_enables_merge_without_owner_review(self):
        sha = "a" * 40
        summary = {
            "number": 7,
            "labels": [{"name": "autonomy:admitted"}],
            "node_id": "PR_node_7",
        }
        detail = {
            "state": "open",
            "draft": False,
            "base": {"ref": "main"},
            "head": {"sha": sha},
            "mergeable": True,
        }
        with (
            patch.object(native_auto_merge, "merge_request", return_value=None),
            patch.object(native_auto_merge, "request", return_value=detail),
            patch.object(native_auto_merge, "admission_check", return_value=(True, True)),
            patch.object(native_auto_merge, "enable") as enable,
        ):
            native_auto_merge.reconcile(summary)
        enable.assert_called_once_with("PR_node_7")


if __name__ == "__main__":
    unittest.main()
