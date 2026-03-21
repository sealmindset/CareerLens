"""Form analyzer -- extracts form fields from job application pages using Playwright.

Navigates to a URL headless, extracts all form elements (inputs, textareas, selects,
file uploads), and returns a structured representation of the form.
"""

import logging
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class FormField:
    """A single form field extracted from the page."""
    field_type: str  # "text", "email", "tel", "textarea", "select", "file", "radio", "checkbox", "date", "url"
    name: str  # name or id attribute
    label: str  # associated label text or placeholder
    required: bool = False
    options: list[str] = field(default_factory=list)  # for select/radio
    placeholder: str = ""
    css_selector: str = ""  # for targeting in JS


@dataclass
class FormAnalysis:
    """Complete form analysis result."""
    url: str
    page_title: str = ""
    form_count: int = 0
    fields: list[FormField] = field(default_factory=list)
    error: str | None = None


async def analyze_form(url: str, timeout_ms: int = 30000) -> FormAnalysis:
    """Navigate to a URL and extract all form fields.

    Uses Playwright headless Chromium to handle JavaScript-rendered pages
    (Workday, Greenhouse, Lever, iCIMS, etc.).
    """
    result = FormAnalysis(url=url)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        result.error = "Playwright is not installed. Cannot analyze form."
        return result

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                ignore_https_errors=True,  # Handle corporate SSL proxies (Zscaler)
            )
            page = await context.new_page()

            # Navigate and wait for the page to settle
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            result.page_title = await page.title()

            # Extract form fields via JavaScript
            fields_data = await page.evaluate("""() => {
                const fields = [];
                const seen = new Set();

                function getLabel(el) {
                    // Check for associated <label>
                    if (el.id) {
                        const label = document.querySelector(`label[for="${el.id}"]`);
                        if (label) return label.textContent.trim();
                    }
                    // Check for parent label
                    const parentLabel = el.closest('label');
                    if (parentLabel) {
                        const text = parentLabel.textContent.trim();
                        // Remove the input's own value from label text
                        return text.replace(el.value || '', '').trim();
                    }
                    // Check for aria-label
                    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
                    // Check for aria-labelledby
                    const labelledBy = el.getAttribute('aria-labelledby');
                    if (labelledBy) {
                        const labelEl = document.getElementById(labelledBy);
                        if (labelEl) return labelEl.textContent.trim();
                    }
                    // Check for preceding sibling text
                    const prev = el.previousElementSibling;
                    if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
                        return prev.textContent.trim();
                    }
                    return '';
                }

                function getSelector(el) {
                    if (el.id) return '#' + CSS.escape(el.id);
                    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
                    // Build a path
                    const tag = el.tagName.toLowerCase();
                    const type = el.getAttribute('type') || '';
                    const idx = Array.from(el.parentElement?.children || []).indexOf(el);
                    return `${tag}[type="${type}"]:nth-child(${idx + 1})`;
                }

                // Collect inputs, textareas, selects
                const elements = document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
                    'textarea, select'
                );

                for (const el of elements) {
                    const key = el.name || el.id || getSelector(el);
                    if (seen.has(key)) continue;
                    seen.add(key);

                    const type = el.tagName.toLowerCase() === 'textarea' ? 'textarea'
                        : el.tagName.toLowerCase() === 'select' ? 'select'
                        : (el.getAttribute('type') || 'text');

                    // Skip hidden or very small elements
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) continue;

                    const options = [];
                    if (el.tagName.toLowerCase() === 'select') {
                        for (const opt of el.options) {
                            if (opt.value) options.push(opt.textContent.trim());
                        }
                    }

                    fields.push({
                        field_type: type,
                        name: el.name || el.id || '',
                        label: getLabel(el) || el.placeholder || el.name || el.id || '',
                        required: el.required || el.getAttribute('aria-required') === 'true',
                        options: options,
                        placeholder: el.placeholder || '',
                        css_selector: getSelector(el),
                    });
                }

                // Count forms on page
                const formCount = document.querySelectorAll('form').length;

                return { fields, formCount };
            }""")

            result.form_count = fields_data.get("formCount", 0)
            for fd in fields_data.get("fields", []):
                result.fields.append(FormField(**fd))

            await browser.close()

    except Exception as e:
        logger.error("Form analysis failed for %s: %s", url, str(e))
        result.error = f"Could not analyze the page: {str(e)[:200]}"

    logger.info(
        "Form analysis: %s - %d fields found, %d forms",
        url, len(result.fields), result.form_count,
    )
    return result


def form_analysis_to_dict(analysis: FormAnalysis) -> dict:
    """Convert FormAnalysis to a serializable dict."""
    return {
        "url": analysis.url,
        "page_title": analysis.page_title,
        "form_count": analysis.form_count,
        "fields": [asdict(f) for f in analysis.fields],
        "error": analysis.error,
    }
