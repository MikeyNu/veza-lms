from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path(os.environ.get("QA_ARTIFACT_DIR", "qa-artifacts/browser"))
ROUTES = tuple(item.strip() for item in os.environ.get("BROWSER_ROUTES", "/design-system,/access-pending").split(",") if item.strip())
VIEWPORTS = {"desktop": {"width": 1440, "height": 1000}, "mobile": {"width": 390, "height": 844}}

@dataclass(frozen=True)
class Finding:
    browser: str
    route: str
    message: str


def slug(route: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", route.strip("/") or "home")


def prepare(page: Page) -> None:
    page.emulate_media(reduced_motion="reduce")
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}")


def semantic_findings(page: Page) -> list[str]:
    return page.evaluate("""
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
    """)


def keyboard_findings(page: Page) -> list[str]:
    findings: list[str] = []
    observed: set[str] = set()
    for _ in range(30):
        page.keyboard.press("Tab")
        focus = page.evaluate("""
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
        """)
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


def capture(browser: Browser, name: str, base_url: str, output: Path, audit: bool) -> list[Finding]:
    output.mkdir(parents=True, exist_ok=True)
    findings: list[Finding] = []
    for viewport_name, viewport in VIEWPORTS.items():
        context = browser.new_context(viewport=viewport, locale="en-ZA", timezone_id="Africa/Johannesburg")
        page = context.new_page()
        for route in ROUTES:
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            response = page.goto(f"{base_url.rstrip('/')}{route}", wait_until="networkidle", timeout=30_000)
            prepare(page)
            page.wait_for_timeout(150)
            if response is None or response.status >= 400:
                findings.append(Finding(name, route, f"Navigation failed with status {response.status if response else 'none'}"))
                continue
            findings.extend(Finding(name, route, f"Console error: {message}") for message in console_errors)
            findings.extend(Finding(name, route, f"Page error: {message}") for message in page_errors)
            if audit:
                findings.extend(Finding(name, route, message) for message in semantic_findings(page))
                if name == "chromium" and viewport_name == "desktop":
                    findings.extend(Finding(name, route, message) for message in keyboard_findings(page))
            page.screenshot(path=str(output / f"{name}-{viewport_name}-{slug(route)}.png"), full_page=True, animations="disabled")
        context.close()
    return findings


def pixel_change(reference: Path, current: Path) -> float:
    with Image.open(reference).convert("RGB") as left, Image.open(current).convert("RGB") as right:
        if left.size != right.size:
            return 1.0
        histogram = ImageChops.difference(left, right).convert("L").histogram()
        changed = sum(count for value, count in enumerate(histogram) if value > 12)
        return changed / (left.width * left.height)


def audit(base_url: str) -> None:
    findings: list[Finding] = []
    with sync_playwright() as playwright:
        for name in ("chromium", "firefox", "webkit"):
            browser = getattr(playwright, name).launch(headless=True)
            findings.extend(capture(browser, name, base_url, ROOT, True))
            browser.close()
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "browser-quality.json").write_text(json.dumps({"routes": ROUTES, "findings": [asdict(item) for item in findings]}, indent=2) + "\n")
    if findings:
        raise AssertionError("\n".join(f"[{item.browser}] {item.route}: {item.message}" for item in findings))


def compare(base_url: str, reference_url: str) -> None:
    maximum = float(os.environ.get("VISUAL_MAX_CHANGED_RATIO", "0.02"))
    current_dir = ROOT / "current"
    reference_dir = ROOT / "reference"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        capture(browser, "chromium", base_url, current_dir, False)
        capture(browser, "chromium", reference_url, reference_dir, False)
        browser.close()
    ratios = {item.name: pixel_change(reference_dir / item.name, item) if (reference_dir / item.name).exists() else 1.0 for item in current_dir.glob("*.png")}
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "visual-comparison.json").write_text(json.dumps({"maximumChangedRatio": maximum, "ratios": ratios}, indent=2) + "\n")
    failures = {name: ratio for name, ratio in ratios.items() if ratio > maximum}
    if failures:
        raise AssertionError("Visual regression threshold exceeded: " + ", ".join(f"{name}={ratio:.4%}" for name, ratio in failures.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("audit", "compare"))
    parser.add_argument("--base-url", default=os.environ.get("BASE_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--reference-url", default=os.environ.get("REFERENCE_URL"))
    args = parser.parse_args()
    if args.mode == "audit":
        audit(args.base_url)
    elif args.reference_url:
        compare(args.base_url, args.reference_url)
    else:
        raise SystemExit("--reference-url is required for compare mode")

if __name__ == "__main__":
    main()
