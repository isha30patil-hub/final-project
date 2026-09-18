"""Playwright-driven exploration of a target site, used to ground AI-generated
Playwright scripts in real selectors instead of invented ones."""

MAX_SUMMARY_CHARS = 6000


async def explore_page(target_url: str, browser) -> str:
    """Navigate to target_url with an already-launched Playwright browser and
    return a bounded textual accessibility-tree summary (Playwright's own
    aria_snapshot format: role, accessible name, structure) for grounding
    script generation. Raises on navigation failure so the caller can
    classify it as an environment error."""
    context = await browser.new_context()
    page = await context.new_page()
    try:
        await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        summary = await page.locator("body").aria_snapshot()
        return summary[:MAX_SUMMARY_CHARS]
    finally:
        await context.close()
