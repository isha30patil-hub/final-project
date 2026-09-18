"""AI orchestration: test-case generation, coverage validation, Playwright
script generation, and failure analysis. Consolidates all LLM calls so main.py
stays focused on HTTP/DB wiring."""

import json
import os
import re

import google.generativeai as genai
import requests
from openai import OpenAI
import anthropic
from pydantic import ValidationError

from schemas import AITestCase, CoverageResult, FailureAnalysis

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower().strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"').strip("'")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip().strip('"').strip("'")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5").strip()

MAX_COVERAGE_ITERATIONS = int(os.getenv("MAX_COVERAGE_ITERATIONS", "2"))

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


# ---------------------------------------------------------------------------
# Low-level AI transport (moved from main.py)
# ---------------------------------------------------------------------------

def generate_ai_response(prompt: str) -> str:
    if AI_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            raise Exception("Gemini API key is missing")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        }
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2},
        }
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        if response.status_code != 200:
            raise Exception(response.text)
        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            raise Exception(f"Gemini response text not found: {data}")

    if AI_PROVIDER == "openai":
        if not openai_client:
            raise Exception("OpenAI API key is missing")
        response = openai_client.responses.create(model=OPENAI_MODEL, input=prompt)
        return response.output_text

    if AI_PROVIDER == "claude":
        if not anthropic_client:
            raise Exception("Claude API key is missing")
        response = anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    raise Exception("Invalid AI provider selected")


def extract_json_from_ai_response(text: str):
    cleaned = text.strip()
    cleaned = re.sub(r"```json", "", cleaned)
    cleaned = re.sub(r"```", "", cleaned)
    return json.loads(cleaned)


def extract_code_from_ai_response(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"```python", "", cleaned)
    cleaned = re.sub(r"```", "", cleaned)
    return cleaned.strip()


def get_json_case_list(parsed):
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ["testcases", "test_cases", "generated_testcases", "validated_testcases", "cases", "additional_tests_required"]:
            value = parsed.get(key)
            if isinstance(value, list):
                return value
    return []


def _normalize_title(title: str) -> str:
    return " ".join((title or "").lower().strip().split())


# ---------------------------------------------------------------------------
# Test-case generation (system prompt + structured schema)
# ---------------------------------------------------------------------------

GENERATION_SYSTEM_PROMPT = """You are an expert QA Architect responsible for designing comprehensive software test coverage.

Analyze the supplied requirement text and generate structured, deterministic, high-quality test cases. Do NOT generate random tests - reason systematically about the application's behavior.

For every feature identifiable in the requirement text, evaluate: happy paths, positive cases, negative cases, boundary/edge cases, validation, error handling, authentication, authorization/RBAC, security, UI behavior, API/integration behavior, data persistence, state transitions, and end-to-end workflows. Prioritize meaningful coverage over redundant volume.

Return ONLY a JSON array (no markdown, no commentary). Each item must match exactly this shape:
{
  "id": "TC-<MODULE>-<NNN>",
  "title": "string",
  "module": "string",
  "feature": "string or null",
  "priority": "Low|Medium|High",
  "severity": "Low|Medium|High|Critical",
  "type": "Positive|Negative|Boundary|Edge Case|E2E|Security|UI|API",
  "category": "string, e.g. Authentication, Authorization, RBAC, Security, UI, API",
  "role": "the user role this test runs as, or null if role-independent",
  "preconditions": ["string", ...],
  "test_data": {"key": "value or a {{PLACEHOLDER}} token"},
  "steps": [{"step": 1, "action": "string", "expected_result": "string"}, ...],
  "expected_final_state": "string",
  "automation": {"automatable": true|false, "requires_credentials": true|false, "requires_user_input": true|false},
  "security": {"security_relevance": true|false, "risk": "string or null"},
  "tags": ["string", ...]
}

CRITICAL RULE: never put a literal username/password/token/secret value in test_data or steps. Always use placeholder tokens such as {{ADMIN_USERNAME}}, {{ADMIN_PASSWORD}}, {{MANAGER_USERNAME}}, {{MANAGER_PASSWORD}}, {{EMPLOYEE_USERNAME}}, {{EMPLOYEE_PASSWORD}} for any credential-shaped field.

Generate between 8 and 20 test cases covering positive, negative, boundary, authentication/authorization (if roles are implied), and security-relevant scenarios found in the requirement text. If the requirement text is missing information needed for a category, skip that category rather than inventing behavior."""


def build_testcase_generation_prompt(requirement_text: str) -> str:
    return f"""{GENERATION_SYSTEM_PROMPT}

Requirement text:
\"\"\"{requirement_text[:12000]}\"\"\"
"""


def _build_validation_fix_prompt(original_prompt: str, errors: list[dict]) -> str:
    error_text = "\n".join(f"- {e['error']}" for e in errors[:10])
    return f"""{original_prompt}

Your previous output failed schema validation with these errors:
{error_text}

Return corrected JSON only, fixing every error above. No markdown, no commentary."""


def _parse_and_validate(raw_response: str) -> tuple[list[AITestCase], list[dict]]:
    parsed = extract_json_from_ai_response(raw_response)
    cases = get_json_case_list(parsed)
    validated, errors = [], []
    for raw in cases:
        try:
            validated.append(AITestCase.model_validate(raw))
        except ValidationError as exc:
            errors.append({"raw": raw, "error": str(exc)})
    return validated, errors


def generate_testcases_from_requirement(requirement_text: str) -> dict:
    """Full generation pipeline: generate -> validate (1 retry) -> coverage-validator loop."""
    prompt = build_testcase_generation_prompt(requirement_text)
    raw_response = generate_ai_response(prompt)
    validated, errors = _parse_and_validate(raw_response)

    if not validated and errors:
        fix_prompt = _build_validation_fix_prompt(prompt, errors)
        raw_response = generate_ai_response(fix_prompt)
        validated, errors = _parse_and_validate(raw_response)

    coverage_report = {"iterations_run": 0, "final_gaps": [], "duplicates": [], "invalid_tests": []}
    seen_titles = {_normalize_title(c.title) for c in validated}

    for iteration in range(MAX_COVERAGE_ITERATIONS):
        coverage = validate_coverage(requirement_text, validated)
        coverage_report["iterations_run"] = iteration + 1
        coverage_report["final_gaps"] = coverage.coverage_gaps
        coverage_report["duplicates"] = coverage.duplicates
        coverage_report["invalid_tests"] = coverage.invalid_tests

        if coverage.coverage_complete or not coverage.additional_tests_required:
            break

        for extra in coverage.additional_tests_required:
            key = _normalize_title(extra.title)
            if key and key not in seen_titles:
                validated.append(extra)
                seen_titles.add(key)

    return {
        "cases": validated,
        "validation_errors": errors,
        "coverage_report": coverage_report,
    }


# ---------------------------------------------------------------------------
# Coverage validator agent
# ---------------------------------------------------------------------------

def build_coverage_validation_prompt(requirement_text: str, cases: list[AITestCase]) -> str:
    summaries = [
        {"id": c.id, "title": c.title, "module": c.module, "type": c.type,
         "category": c.category, "role": c.role}
        for c in cases
    ]
    return f"""You are a senior QA test coverage auditor.

Review the generated test cases against the supplied requirement text. Identify missing coverage across: Positive, Negative, Boundary, Edge, E2E, Authentication, Authorization, RBAC, Security, Validation, Error handling, UI, API, Data persistence, State transitions. Also detect duplicate tests, contradictory tests, and tests that don't trace to the requirement text.

Requirement text:
\"\"\"{requirement_text[:8000]}\"\"\"

Existing test cases (summary only):
{json.dumps(summaries, indent=2)}

Return ONLY JSON matching exactly this shape:
{{
  "coverage_complete": true|false,
  "coverage_gaps": ["string", ...],
  "duplicates": ["string", ...],
  "invalid_tests": ["string", ...],
  "additional_tests_required": [ <same test-case object shape as the generation schema, only when coverage_complete is false> ]
}}"""


def validate_coverage(requirement_text: str, cases: list[AITestCase]) -> CoverageResult:
    try:
        prompt = build_coverage_validation_prompt(requirement_text, cases)
        raw = generate_ai_response(prompt)
        parsed = extract_json_from_ai_response(raw)
        return CoverageResult.model_validate(parsed)
    except Exception:
        # Never let a broken validator call loop generation forever or fail the request.
        return CoverageResult(coverage_complete=True)


# ---------------------------------------------------------------------------
# Playwright script generation
# ---------------------------------------------------------------------------

def build_script_generation_prompt(test_case: AITestCase, dom_summary: str, target_url: str) -> str:
    steps_desc = "\n".join(f"{s.step}. {s.action} -> expected: {s.expected_result}" for s in test_case.steps)
    return f"""You are a senior Playwright automation engineer. Generate a single Python async function that implements the test case below as a real Playwright script, grounded ONLY in the real page structure provided.

Target URL: {target_url}

Real page structure captured from the live site (role, accessible name):
\"\"\"{(dom_summary or "no elements captured")[:6000]}\"\"\"

Test case: {test_case.title}
Role: {test_case.role or "N/A"}
Test data (values may be {{PLACEHOLDER}} tokens - use them verbatim, never invent literal credential values):
{json.dumps(test_case.test_data, indent=2)}

Steps to implement:
{steps_desc}

Requirements:
- Function signature must be EXACTLY: async def run(page, data, report_step):
- `data` is a dict mapping placeholder tokens (e.g. "{{ADMIN_USERNAME}}") to resolved runtime values - use data.get("{{TOKEN}}", "") to fill fields, never hardcode a real secret.
- Prefer selectors in this priority order: get_by_role, get_by_label, get_by_placeholder, get_by_text, [data-testid], CSS, only using XPath as a last resort. Ground every selector in the page structure above - do not invent selectors that aren't implied by it.
- ALWAYS pass exact=True to get_by_role(name=...) and get_by_text(...). The name match is a substring match by default, so name="Sign in" also matches "Sign in with Microsoft" and the click fails with a strict-mode violation.
- A step may only report PASSED after its expected result has actually been verified - never because the actions simply didn't throw. If the expected result names an HTTP request or status (e.g. "POST /api/v1/auth/login returns 200"), wrap the triggering action in `async with page.expect_response(lambda r: "/api/v1/auth/login" in r.url) as resp:` and check `(await resp.value).status`. If it names a URL or redirect, verify with `await page.wait_for_url(...)`. If it names an element or text, wait for that element or text.
- Build every URL you navigate to from the Target URL above (Target URL + path); never hardcode a different host.
- For each step, call `await report_step(<step_number>, "PASSED", "<actual result text>")` on success or `await report_step(<step_number>, "FAILED", "<actual result text>")` on a failed assertion, inside a try/except around that step's actions.
- Do not open/close the browser or page yourself - `page` is already open and will be closed by the caller.
- ONLY use real Playwright async-API methods. `page` has no `.expect(...)` method - it does not exist. For explicit assertions use the standalone `expect` function, already available with no import needed: `await expect(locator).to_have_value("...")`, `await expect(locator).to_be_visible()`, etc. For most steps, prefer a plain `await locator.wait_for()` or `await page.get_by_text("...").wait_for()` instead of an assertion - it's simpler and just as valid for confirming something appeared.
- Output ONLY raw Python source, no markdown fences, no commentary, no explanation."""


def generate_playwright_script(test_case: AITestCase, dom_summary: str, target_url: str) -> str:
    prompt = build_script_generation_prompt(test_case, dom_summary, target_url)
    raw = generate_ai_response(prompt)
    return extract_code_from_ai_response(raw)


# ---------------------------------------------------------------------------
# Failure analysis
# ---------------------------------------------------------------------------

def build_failure_analysis_prompt(test_case_title: str, steps_data: list[dict], dom_summary: str) -> str:
    return f"""You are a QA failure analyst. Given the executed step results below for test case "{test_case_title}", separate OBSERVED FACTS (literally what the data shows) from your LIKELY CAUSE (your own inference). Do not guess at or reproduce any masked (***) values.

Step results:
{json.dumps(steps_data, indent=2)}

Page context captured during script generation:
\"\"\"{(dom_summary or "")[:2000]}\"\"\"

Classify the likely cause as one of: application bug, test data, authentication, network, selector, timeout, environment, browser, infrastructure - or state it's unclear.

Return ONLY JSON matching exactly:
{{"observed_facts": ["string", ...], "likely_cause": "string", "confidence": "Low"|"Medium"|"High", "suggested_next_step": "string or null"}}"""


def analyze_failure(test_case_title: str, steps_data: list[dict], dom_summary: str = ""):
    try:
        prompt = build_failure_analysis_prompt(test_case_title, steps_data, dom_summary)
        raw = generate_ai_response(prompt)
        parsed = extract_json_from_ai_response(raw)
        return FailureAnalysis.model_validate(parsed)
    except Exception:
        return None
