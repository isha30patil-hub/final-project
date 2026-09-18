# TestAI — AI-Powered Software Testing Platform

Upload a requirement document (SRS/SOW PDF), generate structured test cases with AI,
review/approve them, auto-generate Playwright scripts grounded in your site's real DOM,
run them in a real browser with live step-by-step results, get an AI failure analysis
on failures, and track defects — all from one dashboard.

This repo has two parts you actually need to run:

| Part | Location | Tech |
|---|---|---|
| Backend API | [`Software testing/fastapi_backend`](Software%20testing/fastapi_backend) | FastAPI + PostgreSQL + Playwright |
| Frontend UI | [`ignite-testing-main`](ignite-testing-main) | TanStack Start (React) |

> **Ignore these — leftover/unused scaffolding, not part of the running app:**
> `Software testing/backend` (an empty Node.js skeleton) and `Software testing/frontend`
> (a default Vite+React template with no real pages).

---

## 1. Prerequisites

- Python 3.11+ (with `venv`)
- Node.js 18+
- PostgreSQL running locally (or reachable)
- An API key for **one** AI provider: Google Gemini, OpenAI, or Anthropic

---

## 2. Backend setup (`Software testing/fastapi_backend`)

```bash
cd "Software testing/fastapi_backend"
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium   # the browser the execution engine drives
```

Only Chromium is needed — the backend launches `chromium` specifically. A bare
`playwright install` also downloads Firefox and WebKit (~1 GB more) for nothing.

[`requirements.txt`](Software%20testing/fastapi_backend/requirements.txt) pins the
exact versions this backend was built and tested against:

```
fastapi==0.141.1
uvicorn[standard]==0.53.0
python-multipart==0.0.32
psycopg2-binary==2.9.13
PyPDF2==3.0.1
python-dotenv==1.2.3
requests==2.34.2
pydantic==2.13.5
google-generativeai==0.8.6
openai==3.14.1
anthropic==1.6.0
playwright==1.63.0
cryptography==50.0.1
```

If you ever add a new import to the backend, install it with `pip install <package>`
then run `pip freeze | grep -i <package>` and add the pinned line here — don't add
unpinned entries, since an unpinned version can silently break the app on a fresh
install months later.

### Configure `.env`

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```ini
AI_PROVIDER=gemini              # gemini | openai | claude — pick ONE

GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

GEMINI_MODEL=gemini-2.5-flash   # model used for the provider you picked
OPENAI_MODEL=gpt-4.1-mini
ANTHROPIC_MODEL=claude-sonnet-4-5

DB_HOST=localhost
DB_PORT=5432
DB_NAME=testai
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# How many extra "fill the coverage gaps" rounds the validator agent may run
# per Generate click (each round = 1 more AI call). 0 disables the loop.
MAX_COVERAGE_ITERATIONS=2

CREDENTIAL_ENCRYPTION_KEY=       # see below
```

`.env` is gitignored — never commit it. Only `.env.example` (with blank values) is tracked.

**Getting an AI provider key** (you only need the one matching `AI_PROVIDER`):

- **Gemini** — https://aistudio.google.com/apikey (free tier is capped at **20 requests/day** for `gemini-2.5-flash` — you will hit this fast while testing; enable billing on the Google Cloud project to remove the cap)
- **OpenAI** — https://platform.openai.com/api-keys (requires adding billing/credits before it works)
- **Anthropic** — https://console.anthropic.com/settings/keys (requires adding billing/credits before it works)

These are plain **API keys** (a single secret string) — not OAuth Client ID/Secret, which is a different, unrelated credential type.

**Generating `CREDENTIAL_ENCRYPTION_KEY`** (used to encrypt stored test-environment credentials at rest):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Paste the output as the value of `CREDENTIAL_ENCRYPTION_KEY`. If you change this key
later, credentials saved under the old key can no longer be decrypted — re-enter them.

### Create the database

```bash
createdb testai      # or create it via your Postgres client of choice
python migrate.py
```

`migrate.py` builds the schema from the files in `migrations/`. It is also run on every
backend startup, so after pulling new code you just restart — **you never need to drop,
dump or restore the database to pick up a schema change.** How it works, and how to add
a migration, is in [Database migrations](#database-migrations) below.

### Run the backend

```bash
uvicorn main:app --reload --port 8000
```

The API is now at **http://127.0.0.1:8000** (interactive docs at `/docs`).

> `--reload` only watches `.py` files. **Editing `.env` does not restart the server** —
> after changing an API key or any other env value, stop it (`Ctrl+C`) and start it
> again, or the process keeps using the old values it loaded at boot.

On startup the backend launches one headless Chromium instance and one background
execution worker. Any run left in `RUNNING` by a previous crash is marked `ERROR`
("Server restarted mid-run"); runs still `QUEUED` are re-queued and picked up.

---

## 3. Frontend setup (`ignite-testing-main`)

```bash
cd ignite-testing-main
npm install
npm run dev
```

Vite will print the local URL it picked (commonly **http://localhost:8080**, but it
auto-increments if that port is busy — check your terminal output). Open that URL in
your browser; the page title is **"TestAI — Automated Test Case Generation and Monitoring"**.

The frontend expects the backend at `http://127.0.0.1:8000` (set in
[`src/lib/api.ts`](ignite-testing-main/src/lib/api.ts) — change it there if you run the
API elsewhere).

**Login:** the app has a demo login gate. Use the **Quick Login as Tester** /
**Quick Login as Project Manager** buttons, or sign in with
`tester@testai.com` / `Tester@123` or `manager@testai.com` / `Manager@123`.

> If `npm run dev` reports the port is taken, check for a leftover `vite dev` process
> from a previous run (`ps aux | grep vite`) before assuming something's broken.

---

## 4. Using the app — typical flow

1. **Create a project** on the Projects page, then click its **Open** (eye) icon.
2. On the project page, fill in the **Test Environment** card:
   - **Website URL** — the site your generated scripts will run against. Required before
     any script can be generated or run. If you omit the scheme, `https://` is added for you.
   - **Role credentials** (optional) — a role name plus username/password for that site,
     e.g. role `Admin`. Stored encrypted; **never shown again after saving** (only "configured"
     is displayed; use the trash icon to remove). Generated test cases reference them only as
     placeholders — role `Admin` becomes `{{ADMIN_USERNAME}}` / `{{ADMIN_PASSWORD}}`
     (uppercased, spaces → `_`). Real values are decrypted only inside the execution worker
     at run time and are masked as `***` in anything stored or displayed.
3. Go to **AI Test Generation**, select the project, choose an SRS/SOW PDF, click
   **Upload & Extract Text**, then **Generate Test Cases**. Expect this to take 1–2 minutes:
   it is now 2–3 AI calls (generation + coverage-validator rounds), not one. The toasts tell
   you how many *new unique* cases were created and how many were skipped as duplicates
   (same title already in the project) or as failing schema validation.
4. Review generated cases — approve, reject, or leave for review. High-confidence cases
   are auto-approved.
5. Go to **Test Execution**. Approved cases appear in the table:
   - Cases generated by the AI pipeline and flagged *automatable* show **Script** and
     **Execute** buttons. **Execute** generates a Playwright script on the first run (it
     visits your Website URL, captures the real page structure, and asks the AI to write a
     script using only selectors that actually exist), then runs it in a real headless
     browser. A **Live Run** dialog streams each step as it passes or fails, and shows the
     AI failure analysis when a run fails. **Script** shows/copies the generated code.
   - Older or non-automatable cases keep the manual **Execute → Mark Pass / Fail / Blocked**
     dialog (failing one there prompts you to log a defect).
   - The **Result** column shows the latest automated run status (`PASSED`, `FAILED`,
     `BLOCKED`, `ERROR`, …) for automated cases.
6. **Reports** shows the usual charts plus an **Automated Execution History** table of every
   real run with status, duration, and failure summary. **Defects** tracks logged defects.

---

## 5. How it works

### Backend modules

| File | Role |
|---|---|
| `main.py` | FastAPI app, DB access, all endpoints, execution worker, WebSocket hub, startup migrations |
| `ai_services.py` | Every AI call: test-case generation, coverage validator, Playwright script codegen, failure analysis |
| `schemas.py` | Pydantic models that AI output is validated against (`AITestCase`, `CoverageResult`, `FailureAnalysis`) |
| `browser_exploration.py` | Playwright visit of the Website URL that captures the page's accessibility tree for codegen |
| `crypto.py` | Fernet encrypt/decrypt for stored credentials + `mask_secrets()` |
| `migrate.py` | Applies pending `migrations/*.sql` files; run on startup and by hand (`python migrate.py`) |
| `migrations/` | The database schema, as numbered idempotent SQL files — the only place the schema is defined |

### Test-case generation
A senior-QA-architect system prompt asks the model for structured cases (module, feature,
priority/severity, type, role, preconditions, `test_data` with `{{PLACEHOLDER}}` tokens for
anything credential-shaped, numbered steps each with an expected result, automation and
security flags, tags). Output is validated with Pydantic; if nothing validates, one retry
is made with the validation errors fed back. A second **coverage-validator** agent then
audits the set (positive/negative/boundary/E2E/auth/RBAC/security/UI/API…), and any
missing cases it returns are merged in — at most `MAX_COVERAGE_ITERATIONS` rounds, so it
can't loop forever. Cases are deduplicated by normalized title against the project.

### Script generation
`POST /testcases/{id}/generate-script` opens the project's Website URL in Chromium, takes
an ARIA snapshot (roles + accessible names), and asks the AI for one
`async def run(page, data, report_step)` Python function that implements the case's steps
using only selectors implied by that snapshot, calling `report_step(n, "PASSED"|"FAILED",
actual)` per step. The script is stored in `generated_scripts`; the previous one is marked
`STALE`, never deleted.

### Execution
`POST /testcases/{id}/run` inserts a `QUEUED` row in `test_executions` and returns
immediately. A single in-process asyncio worker runs one execution at a time: fresh
browser context per run, Playwright trace always recorded, screenshot captured on any
failed step, credentials decrypted in memory only and masked before anything is persisted.
Outcome classification: all steps pass → `PASSED`; a step reports `FAILED` → `FAILED`; a
Playwright timeout/selector error → `ERROR`; failure before any step ran (site unreachable,
etc.) → `BLOCKED` with `failure_classification = ENVIRONMENT_ERROR`. Failed/errored runs
get an AI **failure analysis** that separates observed facts from the inferred likely cause.
Artifacts live under `fastapi_backend/artifacts/{execution_id}/` (gitignored) and are served
at `http://127.0.0.1:8000/artifacts/…`.

### Live updates
`ws://127.0.0.1:8000/ws/executions/{execution_id}` sends a `SNAPSHOT` of the current state
on connect, then `TEST_STARTED`, `STEP_PASSED` / `STEP_FAILED`, and a final
`TEST_PASSED` / `TEST_FAILED` / `TEST_BLOCKED` / `TEST_ERROR`. The frontend hook
(`src/hooks/use-execution-socket.ts`) reconnects on drop and relies on the snapshot to
catch up.

### Database additions
New tables: `generated_scripts`, `test_executions`, `test_step_results`, `test_artifacts`,
`test_credentials` (ciphertext only). New columns: `projects.base_url`;
`testcases.ai_test_case` (full structured case, JSONB), `role`, `automatable`,
`requires_credentials`, `latest_execution_status`, `latest_execution_id`. Automated runs
never overwrite `testcases.status` (the approval workflow) — they update
`latest_execution_*` instead.

### Database migrations

The schema is defined in exactly one place: the numbered SQL files in
[`migrations/`](Software%20testing/fastapi_backend/migrations), applied by
[`migrate.py`](Software%20testing/fastapi_backend/migrate.py).

**How it runs** — on every backend startup, and whenever you run `python migrate.py`:

1. Creates the `schema_migrations` table if it doesn't exist (`version`, `applied_at`).
2. Reads which versions are already recorded there.
3. Runs every `migrations/*.sql` whose filename (minus `.sql`) is not recorded — in
   filename order, each in its own transaction — and records it on success.

A migration that fails is rolled back, its version is **not** recorded, later files are not
attempted, and startup aborts with the Postgres error. The app therefore never runs
against a half-migrated database, and fixing the file and restarting simply re-runs it.

`001_baseline.sql` is the entire current schema written idempotently, so on an empty
database it builds everything, and on an existing database it only adds whatever is missing.

**Adding a migration — worked example.** Say test cases need a `tags` column. Create
`migrations/002_testcases_tags.sql`:

```sql
ALTER TABLE testcases
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
```

Restart the backend, or run it by hand:

```bash
cd "Software testing/fastapi_backend"
python migrate.py
# Applied: 002_testcases_tags
```

Run it again and it reports `Database already up to date.` Every other developer (and
UAT) gets the column the next time their backend starts.

**Rules:**

- **Number sequentially** — `002_`, `003_`, … Order is by filename, so the number is what
  guarantees your migration runs after the ones it depends on. The rest of the name says
  what it does.
- **Write idempotently** — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`. Then a file that was applied by hand, or half-applied
  outside the runner, is harmless to run again.
- **`NOT NULL` needs a `DEFAULT`** when the table already has rows, or Postgres rejects
  the `ALTER`.
- **Never edit or renumber a migration that has been applied anywhere** — another
  developer's machine, UAT, production. The runner sees the version as done and will not
  re-run it, so the edit silently never lands. Add a new file that alters what you need.
- **One purpose per file.** Several statements are fine (add a table *and* its index);
  unrelated changes are not. Data fixes (`UPDATE …`) belong in a migration too.

**Seeing what's applied:** `python migrate.py` (prints what it applied or that it's up to
date), or in psql: `SELECT * FROM schema_migrations ORDER BY version;`

---

## 6. API reference (new endpoints)

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/projects/{id}/base-url` | Set the project's Website URL (`https://` added if scheme missing) |
| `GET` | `/projects/{id}/credentials` | List configured roles — never returns usernames/passwords |
| `POST` | `/projects/{id}/credentials` | Create/replace `{role, username, password}` (encrypted at rest) |
| `DELETE` | `/projects/{id}/credentials/{role}` | Remove a role's credentials |
| `POST` | `/testcases/{id}/generate-script` | Explore the site + AI-generate the Playwright script (marks previous one `STALE`) |
| `GET` | `/testcases/{id}/script` | Current active script |
| `POST` | `/testcases/{id}/run` | Queue an execution → `{execution_id, status: "QUEUED"}` |
| `POST` | `/test-executions/{id}/cancel` | Cancel a run that is still `QUEUED` |
| `GET` | `/test-executions/{id}` | Execution + step results + artifacts |
| `GET` | `/test-executions?project_id=&testcase_id=&status=` | Execution history |
| `WS` | `/ws/executions/{id}` | Live step events (see above) |

Also changed: `GET /testcases` now accepts `?project_id=&limit=&offset=` (default `limit=100`)
and `GET /projects/{id}/summary` accepts `?testcases_limit=&testcases_offset=`. Both list
responses omit the heavy `ai_test_case` blob — fetch a single case's script/execution
endpoints when you need the full structured data. Summary counts (`total_testcases`, etc.)
are always over the whole project regardless of paging.

---

## 7. Known limitations

- **Site exploration is pre-login only.** Scripts for screens behind a login use best-guess
  login selectors on the first attempt. If a run fails on a selector, regenerate the script
  with `POST /testcases/{id}/generate-script` (there is no Regenerate button in the UI yet;
  **Execute** only generates when no active script exists).
- One execution runs at a time (single worker, single browser). Runs queue behind each other.
- **Cancel** only works while a run is still `QUEUED`; a `RUNNING` script is not interrupted.
- The AI can occasionally emit invalid Playwright code. That surfaces as an `ERROR` run with
  the Python exception in the step's actual result — regenerate the script.
- Generation is 2–3 AI calls per click, so a Gemini free-tier key (20/day) lasts roughly
  6–8 generations plus a handful of script generations / failure analyses.
- In `npm run dev`, React StrictMode intentionally double-fires effects, so you may see some
  API calls twice in the Network tab. This is dev-only and does not happen in a production build.

---

## 8. Troubleshooting

**"AI generation failed" / "Script generation failed" with `RESOURCE_EXHAUSTED` / `429`**
Your AI provider's quota is exhausted (Gemini free tier = 20 requests/day for
`gemini-2.5-flash`, shared across test-case generation, coverage validation, script
generation *and* failure analysis). Generating a new key on the *same* provider project
does **not** help — the quota is tied to the project/account behind the key, not the key
string. Either wait for the daily reset, enable billing, or switch `AI_PROVIDER` to a
different provider with a working key.

**"AI generation failed" with `401 UNAUTHENTICATED` / `ACCESS_TOKEN_TYPE_UNSUPPORTED`**
The key in `.env` is invalid or revoked (e.g. a leaked key that was rotated). Generate a
new one, paste it into `.env`, and **restart the backend** — a running server keeps the old
key in memory.

**"Generate Test Cases" button is disabled**
It needs a document from the current browser session — select a PDF and click
**Upload & Extract Text** first (uploading also enables it for that project).

**"No new unique test cases found. Existing duplicates were skipped."**
Every case the AI produced has a title that already exists in this project. Generation
deduplicates by title, so re-clicking on the same document mostly yields duplicates — try a
different or fuller document.

**"Project has no base_url configured"**
Set the Website URL in that project's Test Environment card before generating or running scripts.

**"No active generated script for this test case"**
No script has successfully been generated yet for that test case — click **Execute** (it
generates first) or call `POST /testcases/{id}/generate-script`. If generation errors (see
above), nothing is saved, so this message is expected until it succeeds.

**"Could not explore target site: …"**
Chromium could not load the Website URL (typo, site down, VPN-only, blocks headless
browsers). Confirm the URL opens in a normal browser from the machine running the backend.

**"Browser not ready yet, try again shortly"**
Playwright's browser instance is still starting up on backend boot; wait a few seconds and retry.

**Run finished as `ERROR` with "Server restarted mid-run"**
The backend restarted while that run was in progress. Just run the test case again.

**Backend won't start: "Migration 00N_… failed and was rolled back"**
That SQL file has an error — the Postgres message is printed right after it. Nothing from
the file was applied and later files were not attempted. Fix the file and start again; since
the version was never recorded, it re-runs from the top.

**`column "…" does not exist` / `relation "…" does not exist` after pulling new code**
The code expects a migration that hasn't run on your database. Restart the backend (it
migrates on startup) or run `python migrate.py` in `fastapi_backend`. If that reports
"already up to date", someone changed the schema without adding a migration file — write
one (see [Database migrations](#database-migrations)).

**The project page shows the Projects list instead of the project**
Fixed — the detail route used to be nested under the list route and never rendered. If you
still see it, make sure `src/routes/_app.projects_.$projectId.tsx` (with the underscore)
exists and restart `npm run dev` so the route tree regenerates.
