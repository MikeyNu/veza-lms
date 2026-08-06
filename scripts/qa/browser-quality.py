from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

from PIL import Image, ImageChops
from playwright.sync_api import Browser, Page, sync_playwright

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = Path(os.environ.get("QA_ARTIFACT_DIR", "qa-artifacts/browser"))
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "mobile": {"width": 390, "height": 844},
}
MEMBERSHIP_ID = os.environ.get(
    "BROWSER_MEMBERSHIP_ID",
    "10000000-0000-4000-8000-000000000003",
)
DEFAULT_INVITATION_TOKEN = "a" * 64
DEFAULT_ROUTE_GROUPS = {
    "public": (
        "/sign-in,"
        f"/invitation?invitationId=10000000-0000-4000-8000-000000000012&token={DEFAULT_INVITATION_TOKEN},"
        "/account-help,/reset-password"
    ),
    "oidc": "/select-workspace,/access-pending",
    "workspace": "/design-system,/admin/institution-setup,/admin/access",
}


@dataclass(frozen=True)
class RouteSpec:
    route: str
    mode: str

    @property
    def expected_path(self) -> str:
        return urlparse(self.route).path or "/"

    @property
    def slug(self) -> str:
        clean = re.sub(r"[^a-zA-Z0-9_-]+", "-", self.expected_path.strip("/") or "home")
        return f"{self.mode}-{clean}"


@dataclass(frozen=True)
class Finding:
    browser: str
    route: str
    viewport: str
    message: str


def parse_routes(value: str, mode: str) -> list[RouteSpec]:
    return [
        RouteSpec(item.strip(), mode)
        for item in value.split(",")
        if item.strip()
    ]


def route_specs() -> tuple[RouteSpec, ...]:
    configured = [
        *parse_routes(
            os.environ.get("PUBLIC_BROWSER_ROUTES", DEFAULT_ROUTE_GROUPS["public"]),
            "public",
        ),
        *parse_routes(
            os.environ.get("OIDC_BROWSER_ROUTES", DEFAULT_ROUTE_GROUPS["oidc"]),
            "oidc",
        ),
        *parse_routes(
            os.environ.get("WORKSPACE_BROWSER_ROUTES", DEFAULT_ROUTE_GROUPS["workspace"]),
            "workspace",
        ),
    ]
    unique: list[RouteSpec] = []
    seen: set[tuple[str, str]] = set()
    for spec in configured:
        key = (spec.mode, spec.route)
        if key not in seen:
            seen.add(key)
            unique.append(spec)
    return tuple(unique)


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


def add_route_cookies(context, base_url: str, oidc_cookie: str, mode: str) -> None:
    if mode == "public":
        return
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    secure = parsed.scheme == "https"
    cookies = [
        {
            "name": "veza_web_session",
            "value": oidc_cookie,
            "url": origin,
            "httpOnly": True,
            "secure": secure,
            "sameSite": "Lax",
        },
    ]
    if mode == "workspace":
        cookies.append(
            {
                "name": "veza_membership",
                "value": MEMBERSHIP_ID,
                "url": origin,
                "httpOnly": True,
                "secure": secure,
                "sameSite": "Lax",
            },
        )
    context.add_cookies(cookies)


def semantic_findings(page: Page, spec: RouteSpec) -> list[str]:
    values = page.evaluate(
        """
        () => {
          const visible = (item) => {
            const style = getComputedStyle(item);
            const box = item.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
          };
          const controls = [...document.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]')].filter(visible);
          const controlName = (control) => {
            const id = control.id;
            const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
            const implicit = control.closest('label');
            return control.getAttribute('aria-label') ||
              control.getAttribute('aria-labelledby') ||
              control.getAttribute('title') ||
              explicit?.textContent ||
              implicit?.textContent ||
              control.textContent ||
              control.value;
          };
          const ids = [...document.querySelectorAll('[id]')].map((item) => item.id).filter(Boolean);
          const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
          return {
            language: document.documentElement.lang,
            mainCount: document.querySelectorAll('main').length,
            h1Count: document.querySelectorAll('h1').length,
            duplicateIds: duplicates,
            imagesWithoutAlt: [...document.querySelectorAll('img:not([alt])')].map((item) => item.src),
            unnamedControls: controls.filter((control) => !String(controlName(control) || '').trim()).map((control) => control.outerHTML.slice(0, 180)),
            nestedInteractiveCount: document.querySelectorAll('a button,button a,button button,a a').length,
            horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
            bodyTextLength: document.body.innerText.trim().length,
            passwordInputCount: document.querySelectorAll('input[type="password"],input[name="password"]').length,
            visibleControlCount: controls.length,
          };
        }
        """,
    )
    findings: list[str] = []
    if not values["language"]:
        findings.append("Document language is missing")
    if values["mainCount"] != 1:
        findings.append("Page must contain exactly one main landmark")
    if values["h1Count"] != 1:
        findings.append("Page must contain exactly one h1")
    if values["duplicateIds"]:
        findings.append(f"Duplicate ids: {', '.join(values['duplicateIds'])}")
    if values["imagesWithoutAlt"]:
        findings.append(f"Images without alt: {values['imagesWithoutAlt']}")
    if values["unnamedControls"]:
        findings.append(f"Unnamed controls: {values['unnamedControls']}")
    if values["nestedInteractiveCount"]:
        findings.append("Page contains nested interactive controls")
    if values["horizontalOverflow"] > 2:
        findings.append(f"Horizontal overflow: {values['horizontalOverflow']}px")
    if values["bodyTextLength"] < 80:
        findings.append("Page rendered insufficient meaningful content")
    if spec.expected_path in {"/sign-in", "/account-help", "/reset-password"} and values["passwordInputCount"]:
        findings.append("Veza identity routes must not collect institutional passwords")
    if values["visibleControlCount"] < 1:
        findings.append("No visible interactive control was rendered")
    return findings


def keyboard_findings(page: Page) -> list[str]:
    findings: list[str] = []
    observed: set[str] = set()
    for _ in range(100):
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
        for spec in route_specs():
            context = browser.new_context(
                viewport=viewport,
                locale="en-ZA",
                timezone_id="Africa/Johannesburg",
                reduced_motion="reduce",
                color_scheme="light",
            )
            add_route_cookies(context, base_url, oidc_cookie, spec.mode)
            page = context.new_page()
            console_errors: list[str] = []
            page_errors: list[str] = []
            request_failures: list[str] = []
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on(
                "requestfailed",
                lambda request: request_failures.append(
                    f"{request.method} {request.url}: {request.failure or 'failed'}"
                ),
            )
            try:
                response = page.goto(
                    f"{base_url.rstrip('/')}{spec.route}",
                    wait_until="domcontentloaded",
                    timeout=30_000,
                )
                try:
                    page.wait_for_load_state("networkidle", timeout=10_000)
                except Exception:
                    page.wait_for_timeout(750)
                prepare(page)
                page.wait_for_timeout(150)
                if response is None or response.status >= 400:
                    findings.append(
                        Finding(
                            browser_name,
                            spec.route,
                            viewport_name,
                            f"Navigation failed with status {response.status if response else 'none'}",
                        ),
                    )
                    continue
                final_url = urlparse(page.url)
                if (
                    final_url.scheme != expected_origin.scheme
                    or final_url.netloc != expected_origin.netloc
                    or final_url.path != spec.expected_path
                ):
                    findings.append(
                        Finding(
                            browser_name,
                            spec.route,
                            viewport_name,
                            f"Unexpected redirect to {final_url.path or '/'}",
                        ),
                    )
                findings.extend(
                    Finding(browser_name, spec.route, viewport_name, f"Console error: {message}")
                    for message in console_errors
                )
                findings.extend(
                    Finding(browser_name, spec.route, viewport_name, f"Page error: {message}")
                    for message in page_errors
                )
                findings.extend(
                    Finding(browser_name, spec.route, viewport_name, f"Request failure: {message}")
                    for message in request_failures
                )
                if audit:
                    findings.extend(
                        Finding(browser_name, spec.route, viewport_name, message)
                        for message in semantic_findings(page, spec)
                    )
                    if browser_name == "chromium" and viewport_name == "desktop":
                        findings.extend(
                            Finding(browser_name, spec.route, viewport_name, message)
                            for message in keyboard_findings(page)
                        )
                page.screenshot(
                    path=str(output / f"{browser_name}-{viewport_name}-{spec.slug}.png"),
                    full_page=True,
                    animations="disabled",
                )
            finally:
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
                "routes": [asdict(spec) for spec in route_specs()],
                "viewports": VIEWPORTS,
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
                f"[{item.browser}/{item.viewport}] {item.route}: {item.message}"
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
    failures = {name: ratio for name, ratio in ratios.items() if ratio > maximum}
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
    if arguments.mode == "audit":
        audit(arguments.base_url)
    elif arguments.reference_url:
        compare(arguments.base_url, arguments.reference_url)
    else:
        raise SystemExit("--reference-url is required for compare mode")


if __name__ == "__main__":
    main()
