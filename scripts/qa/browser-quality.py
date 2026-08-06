from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import contextmanager, nullcontext
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

from PIL import Image, ImageChops
from playwright.sync_api import Browser, Page, sync_playwright

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = Path(os.environ.get("QA_ARTIFACT_DIR", "qa-artifacts/browser"))
ROUTES = tuple(
    item.strip()
    for item in os.environ.get(
        "BROWSER_ROUTES",
        "/design-system,/admin/institution-setup",
    ).split(",")
    if item.strip()
)
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "mobile": {"width": 390, "height": 844},
}
MEMBERSHIP_ID = os.environ.get(
    "BROWSER_MEMBERSHIP_ID",
    "10000000-0000-4000-8000-000000000003",
)


@dataclass(frozen=True)
class Finding:
    browser: str
    route: str
    message: str


def slug(route: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", route.strip("/") or "home")


def prepare(page: Page) -> None:
    page.emulate_media(reduced_motion="reduce")
    page.add_style_tag(
        content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    )


def session_cookie() -> str:
    configured = os.environ.get("BROWSER_SESSION_COOKIE")
    if configured:
        return configured
    completed = subprocess.run(
        ["node", "scripts/qa/create-browser-session-cookie.mjs"],
        cwd=REPOSITORY_ROOT,
        env=os.environ.copy(),
        check=True,
        capture_output=True,
        text=True,
    )
    value = completed.stdout.strip()
    if not value:
        raise RuntimeError("Browser session cookie generator returned an empty value")
    return value


def add_workspace_cookies(context, base_url: str, oidc_cookie: str) -> None:
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    secure = parsed.scheme == "https"
    context.add_cookies(
        [
            {
                "name": "veza_web_session",
                "value": oidc_cookie,
                "url": origin,
                "httpOnly": True,
                "secure": secure,
                "sameSite": "Lax",
            },
            {
                "name": "veza_membership",
                "value": MEMBERSHIP_ID,
                "url": origin,
                "httpOnly": True,
                "secure": secure,
                "sameSite": "Lax",
            },
        ],
    )


def semantic_findings(page: Page) -> list[str]:
    return page.evaluate(
        """
        () => {
          const findings = [];
          const visible = (item) => {
            const style = getComputedStyle(item);
            const box = item.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
          };
          if (!document.documentElement.lang) findings.push('Document language is missing');
          if (document.querySelectorAll('main').length !== 1) findings.push('Page must contain exactly one main landmark');
          if (document.querySelectorAll('h1').length !== 1) findings.push('Page must contain exactly one h1');
          const ids = [...document.querySelectorAll('[id]')].map((item) => item.id).filter(Boolean);
          const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
          if (duplicates.length) findings.push(`Duplicate ids: ${duplicates.join(', ')}`);
          for (const image of document.querySelectorAll('img')) {
            if (!image.hasAttribute('alt')) findings.push(`Image without alt: ${image.src}`);
          }
          for (const control of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="link"]')) {
            if (!visible(control)) continue;
            const name = control.getAttribute('aria-label') || control.getAttribute('title') || control.innerText || control.value;
            if (!String(name || '').trim()) findings.push(`Unnamed control: ${control.outerHTML.slice(0, 120)}`);
          }
          for (const input of document.querySelectorAll('input:not([type="hidden"]),select,textarea')) {
            if (!visible(input)) continue;
            const labelled = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') ||
              (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest('label');
            if (!labelled) findings.push(`Unlabelled form control: ${input.outerHTML.slice(0, 120)}`);
          }
          if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
            findings.push(`Horizontal overflow: ${document.documentElement.scrollWidth}px > ${document.documentElement.clientWidth}px`);
          }
          return findings;
        }
        """,
    )


def keyboard_findings(page: Page) -> list[str]:
    findings: list[str] = []
    observed: set[str] = set()
    for _ in range(80):
        page.keyboard.press("Tab")
        focus = page.evaluate(
            """
            () => {
              const item = document.activeElement;
              if (!item || item === document.body) return null;
              const style = getComputedStyle(item);
              const box = item.getBoundingClientRect();
              return {
                key: `${item.tagName}:${item.id}:${item.getAttribute('href') || ''}:${item.getAttribute('aria-label') || item.textContent || ''}`,
                visible: style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0,
                indicated: style.outlineStyle !== 'none' || style.outlineWidth !== '0px' || style.boxShadow !== 'none',
              };
            }
            """,
        )
        if focus is None:
            continue
        if focus["key"] in observed:
            break
        observed.add(focus["key"])
        if not focus["visible"]:
            findings.append(f"Keyboard focus reached a hidden element: {focus['key'][:120]}")
        if not focus["indicated"]:
            findings.append(f"Keyboard focus has no visible indicator: {focus['key'][:120]}")
    if not observed:
        findings.append("No keyboard reachable controls were found")
    return findings


def capture(
    browser: Browser,
    browser_name: str,
    base_url: str,
    output: Path,
    audit: bool,
    oidc_cookie: str,
) -> list[Finding]:
    output.mkdir(parents=True, exist_ok=True)
    findings: list[Finding] = []
    expected_origin = urlparse(base_url)
    for viewport_name, viewport in VIEWPORTS.items():
        context = browser.new_context(
            viewport=viewport,
            locale="en-ZA",
            timezone_id="Africa/Johannesburg",
        )
        add_workspace_cookies(context, base_url, oidc_cookie)
        for route in ROUTES:
            page = context.new_page()
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            response = page.goto(
                f"{base_url.rstrip('/')}{route}",
                wait_until="networkidle",
                timeout=30_000,
            )
            prepare(page)
            page.wait_for_timeout(150)
            if response is None or response.status >= 400:
                findings.append(
                    Finding(
                        browser_name,
                        route,
                        f"Navigation failed with status {response.status if response else 'none'}",
                    ),
                )
                page.close()
                continue
            final_url = urlparse(page.url)
            if (
                final_url.scheme != expected_origin.scheme
                or final_url.netloc != expected_origin.netloc
                or final_url.path != route
            ):
                findings.append(
                    Finding(
                        browser_name,
                        route,
                        f"Unexpected redirect to {final_url.path or '/'}",
                    ),
                )
            findings.extend(
                Finding(browser_name, route, f"Console error: {message}")
                for message in console_errors
            )
            findings.extend(
                Finding(browser_name, route, f"Page error: {message}")
                for message in page_errors
            )
            if audit:
                findings.extend(
                    Finding(browser_name, route, message)
                    for message in semantic_findings(page)
                )
                if browser_name == "chromium" and viewport_name == "desktop":
                    findings.extend(
                        Finding(browser_name, route, message)
                        for message in keyboard_findings(page)
                    )
            page.screenshot(
                path=str(
                    output
                    / f"{browser_name}-{viewport_name}-{slug(route)}.png"
                ),
                full_page=True,
                animations="disabled",
            )
            page.close()
        context.close()
    return findings


def pixel_change(reference: Path, current: Path, difference_path: Path) -> float:
    with Image.open(reference).convert("RGB") as left, Image.open(current).convert("RGB") as right:
        if left.size != right.size:
            return 1.0
        difference = ImageChops.difference(left, right)
        difference.convert("L").point(lambda value: 255 if value > 12 else 0).save(difference_path)
        histogram = difference.convert("L").histogram()
        changed = sum(count for value, count in enumerate(histogram) if value > 12)
        return changed / (left.width * left.height)


def fixture_ready(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


@contextmanager
def fixture_server() -> Iterator[None]:
    if os.environ.get("BROWSER_FIXTURE_SERVER", "true").lower() == "false":
        yield
        return
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    health_url = os.environ.get("BROWSER_FIXTURE_HEALTH_URL", "http://127.0.0.1:4000/health")
    log_path = ARTIFACT_ROOT / "browser-fixture-api.log"
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            ["node", "scripts/qa/browser-fixture-server.mjs"],
            cwd=REPOSITORY_ROOT,
            env=os.environ.copy(),
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            for _ in range(60):
                if process.poll() is not None:
                    break
                if fixture_ready(health_url):
                    yield
                    return
                time.sleep(0.25)
            log.flush()
            details = log_path.read_text(encoding="utf-8")
            raise RuntimeError(f"Browser fixture API did not become ready.\n{details}")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def audit(base_url: str) -> None:
    findings: list[Finding] = []
    oidc_cookie = session_cookie()
    with fixture_server():
        with sync_playwright() as playwright:
            for name in ("chromium", "firefox", "webkit"):
                browser = getattr(playwright, name).launch(headless=True)
                findings.extend(
                    capture(
                        browser,
                        name,
                        base_url,
                        ARTIFACT_ROOT,
                        True,
                        oidc_cookie,
                    ),
                )
                browser.close()
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "browser-quality.json").write_text(
        json.dumps(
            {
                "routes": ROUTES,
                "findings": [asdict(item) for item in findings],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    if findings:
        raise AssertionError(
            "\n".join(
                f"[{item.browser}] {item.route}: {item.message}"
                for item in findings
            ),
        )


def compare(base_url: str, reference_url: str) -> None:
    maximum = float(os.environ.get("VISUAL_MAX_CHANGED_RATIO", "0.02"))
    current_dir = ARTIFACT_ROOT / "current"
    reference_dir = ARTIFACT_ROOT / "reference"
    difference_dir = ARTIFACT_ROOT / "difference"
    difference_dir.mkdir(parents=True, exist_ok=True)
    oidc_cookie = session_cookie()
    with fixture_server():
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            capture(browser, "chromium", base_url, current_dir, False, oidc_cookie)
            capture(
                browser,
                "chromium",
                reference_url,
                reference_dir,
                False,
                oidc_cookie,
            )
            browser.close()
    ratios = {
        item.name: pixel_change(
            reference_dir / item.name,
            item,
            difference_dir / item.name,
        )
        if (reference_dir / item.name).exists()
        else 1.0
        for item in current_dir.glob("*.png")
    }
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "visual-comparison.json").write_text(
        json.dumps(
            {"maximumChangedRatio": maximum, "ratios": ratios},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    failures = {
        name: ratio
        for name, ratio in ratios.items()
        if ratio > maximum
    }
    if failures:
        raise AssertionError(
            "Visual regression threshold exceeded: "
            + ", ".join(
                f"{name}={ratio:.4%}"
                for name, ratio in failures.items()
            ),
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("audit", "compare"))
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BASE_URL", "http://127.0.0.1:3000"),
    )
    parser.add_argument(
        "--reference-url",
        default=os.environ.get("REFERENCE_URL"),
    )
    arguments = parser.parse_args()
    manager = nullcontext()
    with manager:
        if arguments.mode == "audit":
            audit(arguments.base_url)
        elif arguments.reference_url:
            compare(arguments.base_url, arguments.reference_url)
        else:
            raise SystemExit("--reference-url is required for compare mode")


if __name__ == "__main__":
    main()
