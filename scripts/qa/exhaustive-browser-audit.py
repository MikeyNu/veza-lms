from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[2]
ROUTE_AUDIT = ROOT / "apps" / "web" / "public" / "__veza_route_audit.json"
ARTIFACT_DIR = Path(os.environ.get("EXHAUSTIVE_BROWSER_ARTIFACT_DIR", "qa-artifacts/exhaustive-browser"))
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
APP_MODE = os.environ.get("EXHAUSTIVE_APP", "web").strip().lower()
LOGIN_EMAIL = os.environ.get("BROWSER_LOGIN_EMAIL", "owner@sgela.example")
WORKSPACE_NAME = os.environ.get("BROWSER_WORKSPACE_NAME", "Sgela Academy")
VIEWPORT_WIDTH = max(320, int(os.environ.get("EXHAUSTIVE_VIEWPORT_WIDTH", "1440")))
VIEWPORT_HEIGHT = max(480, int(os.environ.get("EXHAUSTIVE_VIEWPORT_HEIGHT", "1000")))
DISCOVER_ROUTES = os.environ.get("EXHAUSTIVE_DISCOVER", "true").strip().lower() != "false"
EXERCISE_REVEALED = os.environ.get("EXHAUSTIVE_REVEALED", "false").strip().lower() == "true"
INTERACT_CONTROLS = os.environ.get("EXHAUSTIVE_INTERACT", "true").strip().lower() != "false"
EXPECTED_NOT_FOUND = {
    urlparse(item.strip()).path
    for item in os.environ.get("EXHAUSTIVE_EXPECT_NOT_FOUND", "").split(",")
    if item.strip()
}
CONTROL_SELECTOR = ",".join(
    (
        "a[href]",
        "button",
        "input:not([type=hidden])",
        "select",
        "textarea",
        "[contenteditable=true]",
        "[role=button]",
        "[role=link]",
        "[role=tab]",
        "[role=menuitem]",
        "[role=option]",
        "[role=radio]",
        "[role=checkbox]",
        "[role=switch]",
        "summary",
    )
)
PUBLIC_PATHS = {"/sign-in", "/account-help", "/reset-password", "/invitation"}
OIDC_PATHS = {"/select-workspace", "/access-pending"}
EXCLUDED_NAMES = {"Open Next.js Dev Tools", "Open issues overlay", "Collapse issues badge"}
BATCH_NAME = re.sub(r"[^a-zA-Z0-9_-]+", "-", os.environ.get("EXHAUSTIVE_BATCH_NAME", "all"))
DECLARED_ROUTES = tuple(
    str(item["route"])
    for item in json.loads(ROUTE_AUDIT.read_text(encoding="utf-8"))["routes"]
)


@dataclass(frozen=True)
class Control:
    index: int
    tag: str
    role: str
    kind: str
    name: str
    href: str
    required: bool
    disabled: bool
    readonly: bool
    reveals: bool
    checked: bool | None
    value: str
    pattern: str
    options: tuple[str, ...]

    @property
    def label(self) -> str:
        return self.name or self.href or f"{self.tag}[{self.kind}]#{self.index}"


@dataclass(frozen=True)
class Finding:
    browser: str
    route: str
    control: str
    message: str


def route_inventory() -> list[str]:
    payload = json.loads(ROUTE_AUDIT.read_text(encoding="utf-8"))
    routes: list[str] = []
    for item in payload["routes"]:
        route = str(item["route"])
        if ":" not in route:
            routes.append(route)
    routes.extend(
        (
            "/invitation?invitationId=10000000-0000-4000-8000-000000000012&token=" + "a" * 64,
            "/verify/test-verification-code",
        )
    )
    return list(dict.fromkeys(routes))


def mode_for(route: str) -> str:
    path = urlparse(route).path
    if path.startswith("/verify/") or path in PUBLIC_PATHS:
        return "public"
    if path in OIDC_PATHS:
        return "oidc"
    return "workspace"


def settle(page: Page, *, full: bool = True) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=3_000 if full else 750)
    except Exception:
        page.wait_for_timeout(300 if full else 100)
    page.emulate_media(reduced_motion="reduce")
    page.add_style_tag(
        content="*,*::before,*::after{animation:none!important;transition:none!important}",
    )


def authenticate(browser: Browser) -> tuple[dict[str, object], dict[str, object]]:
    context = browser.new_context(locale="en-ZA", timezone_id="Africa/Johannesburg")
    page = context.new_page()
    page.goto(f"{BASE_URL}/sign-in", wait_until="domcontentloaded", timeout=30_000)
    settle(page)
    if APP_MODE == "control-plane":
        page.get_by_role("link", name=re.compile("continue with operator", re.I)).click(
            timeout=10_000,
        )
        page.wait_for_url(
            re.compile(r"^" + re.escape(BASE_URL) + r"/(?!sign-in(?:[/?]|$)).*"),
            timeout=30_000,
        )
        settle(page)
        operator_state = context.storage_state()
        context.close()
        return operator_state, operator_state
    email = page.locator('input[type="email"]').first
    if email.is_visible():
        email.fill(LOGIN_EMAIL)
    continuation = page.get_by_role("button", name=re.compile("continue with email hint", re.I))
    if not continuation.count():
        continuation = page.get_by_role("link", name=re.compile("continue with institution sign-in", re.I))
    continuation.first.click(timeout=10_000)
    page.wait_for_url(
        re.compile(r"^" + re.escape(BASE_URL) + r"/(?:select-workspace|access-pending)?(?:\?|$)"),
        timeout=30_000,
    )
    settle(page)
    if urlparse(page.url).path == "/":
        workspace_state = context.storage_state()
        context.close()
        return workspace_state, workspace_state
    oidc_state = context.storage_state()
    workspace = page.get_by_role("button", name=re.compile(re.escape(WORKSPACE_NAME), re.I))
    if not workspace.count():
        workspace = page.get_by_role("link", name=re.compile(re.escape(WORKSPACE_NAME), re.I))
    if not workspace.count():
        workspace = page.get_by_text(WORKSPACE_NAME, exact=True)
    workspace.first.click(timeout=10_000)
    page.wait_for_url(re.compile(r"^" + re.escape(BASE_URL) + r"/(?:\?|$)"), timeout=30_000)
    settle(page)
    workspace_state = context.storage_state()
    context.close()
    return oidc_state, workspace_state


def context_for(browser: Browser, mode: str, oidc_state: dict[str, object], workspace_state: dict[str, object]) -> BrowserContext:
    state = None if mode == "public" else oidc_state if mode == "oidc" else workspace_state
    return browser.new_context(
        storage_state=state,
        locale="en-ZA",
        timezone_id="Africa/Johannesburg",
        viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
        reduced_motion="reduce",
    )


def storage_for(mode: str, oidc_state: dict[str, object], workspace_state: dict[str, object]) -> dict[str, object] | None:
    return None if mode == "public" else oidc_state if mode == "oidc" else workspace_state


def reset_context(context: BrowserContext, state: dict[str, object] | None) -> None:
    context.clear_cookies()
    if state:
        context.add_cookies(state.get("cookies", []))


def is_declared_page(candidate: str) -> bool:
    path = urlparse(candidate).path
    for route in DECLARED_ROUTES:
        if ":" not in route:
            continue
        pattern = re.sub(r":[^/]+", r"[^/]+", route)
        if re.fullmatch(pattern, path):
            return True
    return False


def collect_controls(page: Page) -> list[Control]:
    values = page.locator(CONTROL_SELECTOR).evaluate_all(
        r"""
        (items, excludedNames) => {
          items.forEach((item) => delete item.dataset.qaAuditIndex);
          const visible = (item) => {
            const style = getComputedStyle(item);
            const box = item.getBoundingClientRect();
            const closedDetails = item.closest('details:not([open])');
            if (closedDetails && !item.closest('summary')) return false;
            if (typeof item.checkVisibility === 'function' && !item.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
          };
          const name = (item) => {
            const labelledBy = item.getAttribute('aria-labelledby');
            const labelled = labelledBy
              ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
              : '';
            const explicit = item.id ? document.querySelector(`label[for="${CSS.escape(item.id)}"]`) : null;
            return String(
              item.getAttribute('aria-label') || labelled || explicit?.textContent ||
              item.closest('label')?.textContent || item.getAttribute('title') || item.textContent ||
              item.getAttribute('placeholder') || item.value || ''
            ).replace(/\s+/g, ' ').trim();
          };
          const unique = [...new Set(items)].filter(visible).filter((item) => {
            if (item.closest('[data-nextjs-dev-tools-button],nextjs-portal')) return false;
            return !excludedNames.includes(name(item));
          });
          return unique.map((item, index) => {
            item.dataset.qaAuditIndex = String(index);
            const checked = 'checked' in item ? Boolean(item.checked) : item.getAttribute('aria-checked');
            return {
              index,
              tag: item.tagName.toLowerCase(),
              role: item.getAttribute('role') || '',
              kind: item.getAttribute('type') || '',
              name: name(item),
              href: item.href || '',
              required: Boolean(item.required || item.getAttribute('aria-required') === 'true'),
              disabled: Boolean(item.disabled || item.getAttribute('aria-disabled') === 'true'),
              readonly: Boolean(item.readOnly || item.getAttribute('aria-readonly') === 'true'),
              reveals: Boolean(item.matches('summary') || item.hasAttribute('aria-haspopup') || item.hasAttribute('aria-controls')),
              checked: checked === null ? null : checked === true || checked === 'true',
              value: String(item.value || ''),
              pattern: item.getAttribute('pattern') || '',
              options: item.tagName === 'SELECT' ? [...item.options].map((option) => option.value) : [],
            };
          });
        }
        """,
        list(EXCLUDED_NAMES),
    )
    return [Control(**{**item, "options": tuple(item["options"])}) for item in values]


def page_semantics(page: Page) -> list[str]:
    values = page.evaluate(
        """
        () => ({
          main: document.querySelectorAll('main').length,
          h1: document.querySelectorAll('h1').length,
          language: document.documentElement.lang,
          nested: document.querySelectorAll('a button,button a,button button,a a').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
          bodyOverflow: document.body.scrollWidth - innerWidth,
          rootOverflowStyle: getComputedStyle(document.documentElement).overflowX,
          maxScrollX: (() => {
            const previousX = scrollX;
            const previousY = scrollY;
            scrollTo(100000, previousY);
            const maximum = scrollX;
            scrollTo(previousX, previousY);
            return maximum;
          })(),
          missingAlt: document.querySelectorAll('img:not([alt])').length,
          text: document.body.innerText.trim().length,
          overflowing: [...document.body.querySelectorAll('*')].filter((item) => {
            const box = item.getBoundingClientRect();
            if (box.width <= 0 || (box.right <= innerWidth + 2 && box.left >= -2)) return false;
            for (let parent = item.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const overflow = getComputedStyle(parent).overflowX;
              if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow)) return false;
            }
            return true;
          }).slice(0, 8).map((item) => {
            const box = item.getBoundingClientRect();
            return `${item.tagName.toLowerCase()}${item.id ? '#' + item.id : ''}${[...item.classList].slice(0, 3).map((name) => '.' + name).join('')}[${Math.round(box.left)}..${Math.round(box.right)}]`;
          }),
          wideContent: [...document.body.querySelectorAll('*')]
            .filter((item) => item.scrollWidth > item.clientWidth + 2)
            .sort((left, right) => (right.scrollWidth - right.clientWidth) - (left.scrollWidth - left.clientWidth))
            .slice(0, 8)
            .map((item) => `${item.tagName.toLowerCase()}${item.id ? '#' + item.id : ''}${[...item.classList].slice(0, 3).map((name) => '.' + name).join('')}[${item.clientWidth}->${item.scrollWidth};overflow=${getComputedStyle(item).overflowX}]`),
          containment: ['.app-main', '.people-workspace', '.people-table-panel', '.people-table-wrap']
            .map((selector) => document.querySelector(selector))
            .filter(Boolean)
            .map((item) => `${item.className}[${item.clientWidth}->${item.scrollWidth};overflow=${getComputedStyle(item).overflowX};contain=${getComputedStyle(item).contain}]`),
        })
        """,
    )
    findings: list[str] = []
    if values["main"] != 1:
        findings.append(f"expected one main landmark, found {values['main']}")
    if values["h1"] != 1:
        findings.append(f"expected one h1, found {values['h1']}")
    if not values["language"]:
        findings.append("document language is missing")
    if values["nested"]:
        findings.append(f"found {values['nested']} nested interactive controls")
    if values["maxScrollX"] > 2 and values["rootOverflowStyle"] not in {"hidden", "clip"}:
        detail = ", ".join(values["overflowing"] or values["wideContent"])
        containment = ", ".join(values["containment"])
        findings.append(f"horizontal overflow scrolls {values['maxScrollX']}px (root {values['overflow']}px, body {values['bodyOverflow']}px, root overflow {values['rootOverflowStyle']})" + (f": {detail}" if detail else "") + (f"; containment: {containment}" if containment else ""))
    if values["missingAlt"]:
        findings.append(f"found {values['missingAlt']} images without alt text")
    if values["text"] < 40:
        findings.append("page has insufficient rendered content")
    return findings


def failed_response(response) -> str:
    headers = response.request.headers
    context = ", ".join(
        f"{name}={headers.get(name, '<missing>')}"
        for name in ("origin", "sec-fetch-site", "referer")
    )
    return f"{response.status} {response.url} [{context}]"


def control_identity(control: Control) -> tuple[str, str, str, str, str]:
    return (control.tag, control.role, control.kind, control.name, control.href)


def newly_revealed(before: list[Control], after: list[Control]) -> list[Control]:
    remaining = Counter(control_identity(control) for control in before)
    revealed: list[Control] = []
    for control in after:
        identity = control_identity(control)
        if remaining[identity]:
            remaining[identity] -= 1
        else:
            revealed.append(control)
    return revealed


def visit(
    browser: Browser,
    browser_name: str,
    route: str,
    oidc_state: dict[str, object],
    workspace_state: dict[str, object],
) -> tuple[list[Control], list[Finding], set[str]]:
    context = context_for(browser, mode_for(route), oidc_state, workspace_state)
    page = context.new_page()
    errors: list[str] = []
    bad_responses: list[str] = []
    expected_not_found = urlparse(route).path in EXPECTED_NOT_FOUND
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on(
        "response",
        lambda response: bad_responses.append(failed_response(response))
        if response.status >= 400
        and not response.url.endswith("/favicon.ico")
        and not (
            expected_not_found
            and response.status == 404
            and urlparse(response.url).path == urlparse(route).path
        )
        else None,
    )
    response = page.goto(urljoin(BASE_URL + "/", route.lstrip("/")), wait_until="domcontentloaded", timeout=30_000)
    settle(page)
    findings: list[Finding] = []
    if urlparse(route).path == "/demo" and response is not None and response.status == 404:
        context.close()
        return [], findings, set()
    if expected_not_found and (response is None or response.status not in {200, 404}):
        findings.append(Finding(browser_name, route, "page", f"expected protected-route fallback, received status {response.status if response else 'none'}"))
    elif not expected_not_found and (response is None or response.status >= 400):
        findings.append(Finding(browser_name, route, "page", f"navigation status {response.status if response else 'none'}"))
    if expected_not_found:
        fallback = page.get_by_role("heading", name="This page is not available", level=1)
        if fallback.count() != 1:
            findings.append(Finding(browser_name, route, "page", "protected-route fallback did not render"))
        if response is not None and response.status == 404:
            errors = [message for message in errors if "Failed to load resource" not in message]
    for message in errors:
        findings.append(Finding(browser_name, route, "page", f"runtime error: {message}"))
    for message in bad_responses:
        findings.append(Finding(browser_name, route, "page", f"failed response: {message}"))
    for message in page_semantics(page):
        findings.append(Finding(browser_name, route, "page", message))
    controls = collect_controls(page)
    discovered = {
        urlparse(control.href).path + (("?" + urlparse(control.href).query) if urlparse(control.href).query else "")
        for control in controls
        if control.href and urlparse(control.href).netloc == urlparse(BASE_URL).netloc
    }
    context.close()
    return controls, findings, discovered


def exercise_control(
    context: BrowserContext,
    state: dict[str, object] | None,
    route: str,
    control: Control,
    opener: Control | None = None,
) -> list[str]:
    reset_context(context, state)
    page = context.new_page()
    failures: list[str] = []
    page_errors: list[str] = []
    response_failures: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("console", lambda message: page_errors.append(message.text) if message.type == "error" else None)
    page.on(
        "response",
        lambda response: response_failures.append(failed_response(response))
        if response.status >= 400 and not response.url.endswith("/favicon.ico")
        else None,
    )
    page.on("dialog", lambda dialog: dialog.accept())
    try:
        page.goto(urljoin(BASE_URL + "/", route.lstrip("/")), wait_until="domcontentloaded", timeout=30_000)
        settle(page, full=False)
        if opener is not None:
            root_controls = collect_controls(page)
            if opener.index >= len(root_controls) or control_identity(root_controls[opener.index]) != control_identity(opener):
                return [f"revealing control changed before replay: {opener.label}"]
            page.locator(f'[data-qa-audit-index="{opener.index}"]').click(timeout=7_000)
            page.wait_for_timeout(250)
            collect_controls(page)
        locator = page.locator(f'[data-qa-audit-index="{control.index}"]')
        candidate: Control | None = None
        for _ in range(4):
            current = collect_controls(page)
            if control.index < len(current):
                candidate = current[control.index]
                locator = page.locator(f'[data-qa-audit-index="{control.index}"]')
                if locator.is_visible():
                    break
            page.wait_for_timeout(150)
        if candidate is None:
            return ["control disappeared on isolated reload"]
        if (candidate.tag, candidate.kind, candidate.name, candidate.href) != (control.tag, control.kind, control.name, control.href):
            return [f"control identity changed to {candidate.label}"]
        if not locator.is_visible():
            return ["control remained transient after isolated replay"]
        page_errors.clear()
        response_failures.clear()
        if control.disabled:
            if not locator.is_disabled():
                failures.append("declared disabled but browser reports enabled")
            return failures
        if control.readonly:
            if locator.is_editable():
                failures.append("declared read-only but browser reports editable")
            return failures
        if control.tag == "select":
            for value in control.options:
                locator.select_option(value)
                if locator.input_value() != value:
                    failures.append(f"could not select option {value!r}")
        elif control.tag in {"input", "textarea"} or control.role == "textbox":
            if control.kind in {"checkbox", "radio"}:
                before = locator.is_checked()
                locator.click(timeout=5_000)
                after = locator.is_checked()
                if control.kind == "checkbox" and before == after:
                    failures.append("checkbox state did not change")
            elif control.kind == "file":
                locator.set_input_files(str(ROOT / "README.md"))
                page.wait_for_timeout(100)
                if not locator.input_value() and "README.md" not in page.locator("body").inner_text():
                    failures.append("file input did not accept a test file")
            elif control.kind in {"range", "color"}:
                sample = "1" if control.kind == "range" else "#123456"
                locator.fill(sample, timeout=5_000)
                if locator.input_value() != sample:
                    failures.append(f"{control.kind} input did not retain entered value")
            elif control.kind not in {"button", "submit", "reset", "image"}:
                sample = {
                    "email": "browser.audit@example.com",
                    "url": "https://example.com/audit",
                    "number": "7",
                    "date": "2026-08-09",
                    "datetime-local": "2026-08-09T10:30",
                    "time": "10:30",
                    "tel": "+27110000000",
                }.get(control.kind, "Browser audit value")
                if control.pattern:
                    if "{64}" in control.pattern:
                        sample = "a" * 64
                    elif "[0-9a-f]{8}" in control.pattern:
                        sample = "00000000-0000-4000-8000-000000000001"
                    elif "a-z0-9" in control.pattern:
                        sample = "browser-audit"
                locator.fill("", timeout=5_000)
                if control.required and locator.evaluate("element => element.checkValidity()"):
                    failures.append("required field accepted an empty value")
                locator.fill(sample, timeout=5_000)
                if control.tag == "input" or control.tag == "textarea":
                    if locator.input_value() != sample:
                        failures.append("field did not retain entered value")
                elif sample not in locator.inner_text():
                    failures.append("editable region did not retain entered text")
        else:
            previous_url = page.url
            try:
                locator.click(timeout=7_000)
            except Exception as error:
                failures.append(f"click failed: {error}")
            page.wait_for_timeout(400)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=2_000)
            except Exception:
                pass
            if control.tag == "a" and control.href and page.url == previous_url and urlparse(control.href).fragment:
                if urlparse(page.url).fragment != urlparse(control.href).fragment:
                    failures.append("fragment link did not update the URL")
        handled_validation = (
            bool(response_failures)
            and all(re.match(r"^(400|409|422) ", message) for message in response_failures)
            and page.locator('[role="alert"]:visible').count() > 0
        )
        if handled_validation:
            page_errors = [message for message in page_errors if "Failed to load resource" not in message]
            response_failures = []
        failures.extend(f"runtime error after interaction: {message}" for message in page_errors)
        failures.extend(f"failed response after interaction: {message}" for message in response_failures)
    except Exception as error:
        failures.append(f"interaction raised {type(error).__name__}: {error}")
    finally:
        page.close()
    return failures


def write_checkpoint(browser_name: str, inventories: list[dict[str, object]], findings: list[Finding]) -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_DIR / f"checkpoint-{browser_name}-{BATCH_NAME}.json").write_text(
        json.dumps(
            {
                "browser": browser_name,
                "completedRoutes": [item["route"] for item in inventories],
                "inventories": inventories,
                "findings": [asdict(item) for item in findings],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def audit_engine(playwright: Playwright, browser_name: str, interact: bool) -> tuple[list[dict[str, object]], list[Finding]]:
    browser = getattr(playwright, browser_name).launch(headless=True)
    oidc_state, workspace_state = authenticate(browser)
    configured_routes = os.environ.get("EXHAUSTIVE_ROUTES", "").strip()
    routes = [item.strip() for item in configured_routes.split(",") if item.strip()] if configured_routes else route_inventory()
    route_start = max(0, int(os.environ.get("EXHAUSTIVE_ROUTE_START", "0")))
    route_limit = max(1, int(os.environ.get("EXHAUSTIVE_ROUTE_LIMIT", str(len(routes)))))
    routes = routes[route_start:route_start + route_limit]
    inventories: list[dict[str, object]] = []
    findings: list[Finding] = []
    seen = set(routes)
    cursor = 0
    while cursor < len(routes):
        route = routes[cursor]
        cursor += 1
        print(f"[{browser_name}] {cursor}/{len(routes)} {route}", flush=True)
        controls, route_findings, discovered = visit(browser, browser_name, route, oidc_state, workspace_state)
        findings.extend(route_findings)
        inventories.append({
            "browser": browser_name,
            "route": route,
            "controls": [asdict(item) for item in controls],
            "controlsExercised": 0,
        })
        if DISCOVER_ROUTES:
            for candidate in sorted(discovered):
                if candidate not in seen and is_declared_page(candidate):
                    seen.add(candidate)
                    routes.append(candidate)
        if interact:
            exercised_count = 0
            mode = mode_for(route)
            state = storage_for(mode, oidc_state, workspace_state)
            interaction_context = context_for(browser, mode, oidc_state, workspace_state)
            for control in controls:
                exercised_count += 1
                for message in exercise_control(interaction_context, state, route, control):
                    findings.append(Finding(browser_name, route, control.label, message))
            revealed_controls: list[Control] = []
            if EXERCISE_REVEALED:
                for opener in (control for control in controls if control.reveals and not control.disabled):
                    reset_context(interaction_context, state)
                    reveal_page = interaction_context.new_page()
                    try:
                        reveal_page.goto(urljoin(BASE_URL + "/", route.lstrip("/")), wait_until="domcontentloaded", timeout=30_000)
                        settle(reveal_page, full=False)
                        before = collect_controls(reveal_page)
                        if opener.index >= len(before) or control_identity(before[opener.index]) != control_identity(opener):
                            findings.append(Finding(browser_name, route, opener.label, "revealing control changed on isolated replay"))
                            continue
                        reveal_page.locator(f'[data-qa-audit-index="{opener.index}"]').click(timeout=7_000)
                        reveal_page.wait_for_timeout(250)
                        after = collect_controls(reveal_page)
                        for child in newly_revealed(before, after):
                            revealed_controls.append(child)
                            exercised_count += 1
                            for message in exercise_control(interaction_context, state, route, child, opener=opener):
                                findings.append(Finding(browser_name, route, f"{opener.label} -> {child.label}", message))
                    except Exception as error:
                        findings.append(Finding(browser_name, route, opener.label, f"revealed-control audit raised {type(error).__name__}: {error}"))
                    finally:
                        reveal_page.close()
                inventories[-1]["revealedControls"] = [asdict(item) for item in revealed_controls]
            inventories[-1]["controlsExercised"] = exercised_count
            interaction_context.close()
        write_checkpoint(browser_name, inventories, findings)
    browser.close()
    return inventories, findings


def main() -> None:
    started = time.monotonic()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    inventories: list[dict[str, object]] = []
    findings: list[Finding] = []
    engines = tuple(filter(None, os.environ.get("EXHAUSTIVE_BROWSER_ENGINES", "chromium,firefox,webkit").split(",")))
    with sync_playwright() as playwright:
        for engine in engines:
            engine_inventory, engine_findings = audit_engine(
                playwright,
                engine,
                interact=engine == "chromium" and INTERACT_CONTROLS,
            )
            inventories.extend(engine_inventory)
            findings.extend(engine_findings)
    payload = {
        "baseUrl": BASE_URL,
        "durationSeconds": round(time.monotonic() - started, 2),
        "engines": engines,
        "routeVisits": len(inventories),
        "controlsInventoried": sum(len(item["controls"]) for item in inventories),
        "controlsExercised": sum(int(item.get("controlsExercised", 0)) for item in inventories),
        "findings": [asdict(item) for item in findings],
        "inventory": inventories,
    }
    (ARTIFACT_DIR / f"report-{BATCH_NAME}.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: payload[key] for key in ("durationSeconds", "routeVisits", "controlsInventoried", "controlsExercised")}, indent=2))
    if findings:
        for item in findings:
            print(f"[{item.browser}] {item.route} :: {item.control} :: {item.message}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
