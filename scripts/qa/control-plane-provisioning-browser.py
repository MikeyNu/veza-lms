from __future__ import annotations

import json
import os
import re
import time

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3001").rstrip("/")
RUN_KEY = str(int(time.time()))
SLUG = f"browser-qa-{RUN_KEY}"


def main() -> None:
    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="en-ZA", timezone_id="Africa/Johannesburg")
        page = context.new_page()
        page.on("pageerror", lambda error: failures.append(f"page error: {error}"))
        page.on(
            "console",
            lambda message: failures.append(f"console error: {message.text}")
            if message.type == "error"
            else None,
        )
        page.on(
            "response",
            lambda response: failures.append(f"response {response.status}: {response.url}")
            if response.status >= 400 and not response.url.endswith("/favicon.ico")
            else None,
        )

        page.goto(f"{BASE_URL}/sign-in", wait_until="domcontentloaded", timeout=30_000)
        page.get_by_role("link", name=re.compile("continue with operator", re.I)).click()
        page.wait_for_url(
            re.compile(r"^" + re.escape(BASE_URL) + r"/(?!sign-in(?:[/?]|$)).*"),
            timeout=30_000,
        )
        page.goto(f"{BASE_URL}/tenants/new", wait_until="networkidle", timeout=30_000)

        page.get_by_label("Institution display name").fill(f"Browser QA {RUN_KEY}")
        page.get_by_label("Registered legal name").fill(f"Browser QA {RUN_KEY} Trust")
        page.get_by_label("Workspace slug").fill(SLUG)

        for label in (
            "Deployment tier",
            "Residency region",
            "Commercial plan",
            "Default locale",
            "Institution timezone",
        ):
            field = page.get_by_label(label)
            options = field.locator("option").evaluate_all("items => items.map(item => item.value)")
            for option in options:
                field.select_option(option)

        page.get_by_role("button", name="Continue").click()
        page.get_by_role("heading", name="Capabilities and limits").wait_for()
        modules = page.locator(".module-option input")
        module_labels = page.locator(".module-option")
        module_count = modules.count()
        if not modules.first.is_disabled() or not modules.first.is_checked():
            failures.append("core module was not checked and immutable")
        for index in range(1, module_count):
            field = modules.nth(index)
            module_labels.nth(index).click()
            if not field.is_checked():
                failures.append(f"module checkbox {index} did not select")
        if module_count > 1:
            modules.nth(1).focus()
            page.keyboard.press("Space")
            page.keyboard.press("Space")
            if not modules.nth(1).is_checked():
                failures.append("module checkbox did not retain its state after keyboard toggling")

        page.get_by_role("button", name="Back").click()
        if page.get_by_label("Workspace slug").input_value() != SLUG:
            failures.append("step-one values were not retained after Back")
        page.get_by_role("button", name="Continue").click()
        page.get_by_role("button", name="Continue").click()
        page.get_by_role("heading", name="Owner and review").wait_for()
        page.get_by_label("First tenant owner").fill(f"owner+{RUN_KEY}@candy.example")

        page.get_by_role("button", name="Back").click()
        page.get_by_role("button", name="Continue").click()
        if page.get_by_label("First tenant owner").input_value() != f"owner+{RUN_KEY}@candy.example":
            failures.append("owner identity was not retained after Back")

        page.get_by_role("button", name="Start provisioning").click()
        page.get_by_text("entered the provisioning workflow.").wait_for(timeout=30_000)
        if failures:
            raise AssertionError("\n".join(failures))

        print(json.dumps({"slug": SLUG, "modulesSelected": module_count, "status": "queued"}))
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
