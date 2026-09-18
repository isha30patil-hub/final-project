from fastapi import FastAPI, File, UploadFile, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
import psycopg2
from psycopg2.extras import RealDictCursor
from PyPDF2 import PdfReader
import io
import json
import os
import re
import asyncio
import traceback
from datetime import datetime, timezone
from dotenv import load_dotenv
from typing import Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
ARTIFACTS_DIR = os.path.join(BASE_DIR, "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# Must run before importing crypto/ai_services/browser_exploration - they read
# their config (API keys, encryption key) from the environment at import time.
load_dotenv(ENV_PATH, override=True)

from playwright.async_api import async_playwright, expect as playwright_expect, TimeoutError as PlaywrightTimeoutError

import crypto
from schemas import AITestCase
import ai_services
from ai_services import generate_ai_response, extract_json_from_ai_response, get_json_case_list
import browser_exploration

DB_HOST = os.getenv("DB_HOST", "localhost").strip()
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "testai").strip()
DB_USER = os.getenv("DB_USER", "postgres").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/artifacts", StaticFiles(directory=ARTIFACTS_DIR), name="artifacts")

# In-process execution queue + WebSocket subscriber registry (no external broker).
execution_queue: "asyncio.Queue[int]" = asyncio.Queue()
active_connections: dict[int, set[WebSocket]] = {}
playwright_context: dict = {}


def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT,
        cursor_factory=RealDictCursor
    )

def ensure_testcase_ai_columns(cur):
    """
    Keeps old database compatible and adds AI validation columns automatically.
    Safe to run multiple times.
    """
    cur.execute("""
        ALTER TABLE testcases
        ADD COLUMN IF NOT EXISTS module VARCHAR(100),
        ADD COLUMN IF NOT EXISTS coverage_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER,
        ADD COLUMN IF NOT EXISTS ai_review_remark TEXT,
        ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20);
    """)

def ensure_execution_schema(cur):
    """Additive migration for the execution pipeline. Safe to run multiple times."""
    cur.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS base_url TEXT;")
    cur.execute("""
        ALTER TABLE testcases
        ADD COLUMN IF NOT EXISTS latest_execution_status VARCHAR(20),
        ADD COLUMN IF NOT EXISTS latest_execution_id INTEGER,
        ADD COLUMN IF NOT EXISTS ai_test_case JSONB,
        ADD COLUMN IF NOT EXISTS role VARCHAR(50),
        ADD COLUMN IF NOT EXISTS automatable BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS requires_credentials BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS generated_scripts (
            id SERIAL PRIMARY KEY,
            testcase_id INTEGER NOT NULL REFERENCES testcases(id) ON DELETE CASCADE,
            script_code TEXT NOT NULL,
            target_url TEXT,
            dom_snapshot_summary TEXT,
            generation_model VARCHAR(100),
            status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_generated_scripts_testcase ON generated_scripts(testcase_id);")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS test_executions (
            id SERIAL PRIMARY KEY,
            testcase_id INTEGER NOT NULL REFERENCES testcases(id) ON DELETE CASCADE,
            generated_script_id INTEGER REFERENCES generated_scripts(id),
            status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
            requested_by VARCHAR(100),
            queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            failure_classification VARCHAR(30),
            failure_summary TEXT,
            failure_analysis JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_test_executions_testcase ON test_executions(testcase_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_test_executions_status ON test_executions(status);")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS test_step_results (
            id SERIAL PRIMARY KEY,
            execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
            step_number INTEGER NOT NULL,
            action TEXT,
            expected_result TEXT,
            actual_result TEXT,
            status VARCHAR(20) NOT NULL,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            error_message TEXT
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_test_step_results_execution ON test_step_results(execution_id);")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS test_artifacts (
            id SERIAL PRIMARY KEY,
            execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
            step_result_id INTEGER REFERENCES test_step_results(id) ON DELETE CASCADE,
            artifact_type VARCHAR(20) NOT NULL,
            file_path TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_test_artifacts_execution ON test_artifacts(execution_id);")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS test_credentials (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL,
            username_encrypted TEXT NOT NULL,
            password_encrypted TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE (project_id, role)
        );
    """)

def normalize_for_duplicate(value):
    if value is None:
        return ""
    return " ".join(str(value).lower().strip().split())

def safe_int(value, default=70):
    try:
        score = int(float(value))
        return max(0, min(100, score))
    except Exception:
        return default

def to_boolean(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ["true", "yes", "y", "1", "matched", "match"]

def decide_auto_status(requirement_match, ai_quality_score):
    """
    Automation rule:
    - Good matching cases go directly to Execution as Approved.
    - Doubtful cases stay as Review.
    - Wrong/irrelevant cases are Rejected.
    """
    if requirement_match and ai_quality_score >= 85:
        return "Approved"
    if requirement_match and ai_quality_score >= 60:
        return "Review"
    return "Rejected"

def build_ai_recommendation(status):
    if status == "Approved":
        return "Auto Approved"
    if status == "Review":
        return "Needs Review"
    return "Auto Rejected"

def get_json_case_list(parsed):
    """
    Gemini/OpenAI/Claude may sometimes return either a list or an object.
    This helper extracts the test case list safely.
    """
    if isinstance(parsed, list):
        return parsed

    if isinstance(parsed, dict):
        for key in ["testcases", "test_cases", "generated_testcases", "validated_testcases", "cases"]:
            value = parsed.get(key)
            if isinstance(value, list):
                return value

    return []

# Columns returned by list-style testcase queries. Deliberately excludes
# ai_test_case (JSONB, can be several KB per row) - that column is only
# needed for single-row lookups (script generation, execution), never for
# listing, and including it made /testcases and /projects/{id}/summary
# balloon once projects had 50-100+ generated cases.
TESTCASE_LIST_COLUMNS = """
    id, project_id, module, title, steps, expected_result, status,
    coverage_type, ai_quality_score, ai_review_remark, ai_recommendation,
    approved_at, solved_at, created_at, latest_execution_status,
    latest_execution_id, role, automatable, requires_credentials
"""

DEFAULT_TESTCASE_LIST_LIMIT = 100

class Project(BaseModel):
    name: str
    description: str

class TestCase(BaseModel):
    project_id: int
    module: str = "General"
    title: str
    steps: str
    expected_result: str
    status: str = "Generated"
    coverage_type: Optional[str] = None
    ai_quality_score: Optional[int] = None
    ai_review_remark: Optional[str] = None
    ai_recommendation: Optional[str] = None

class Defect(BaseModel):
    testcase_id: int
    defect_title: str
    severity: str
    status: str

class StatusUpdate(BaseModel):
    status: str

class TestRun(BaseModel):
    testcase_id: int
    status: str
    executed_by: str
    comments: str

class GenerateTestCasesRequest(BaseModel):
    document_id: int

class BaseUrlUpdate(BaseModel):
    base_url: str

    @field_validator("base_url")
    @classmethod
    def normalize_base_url(cls, value: str) -> str:
        value = value.strip()
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
            value = f"https://{value}"
        return value

class CredentialIn(BaseModel):
    role: str
    username: str
    password: str

@app.get("/")
def home():
    return {"message": "AI Testing Platform FastAPI Backend Running"}

@app.get("/dbtest")
def db_test():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT NOW();")
    result = cur.fetchone()
    cur.close()
    conn.close()
    return result

@app.get("/projects")
def get_projects():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM projects ORDER BY id;")
    projects = cur.fetchall()
    cur.close()
    conn.close()
    return projects

@app.get("/projects/{project_id}/summary")
def get_project_summary(
    project_id: int,
    testcases_limit: int = DEFAULT_TESTCASE_LIST_LIMIT,
    testcases_offset: int = 0,
):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM projects WHERE id = %s;", (project_id,))
    project = cur.fetchone()

    if not project:
        cur.close()
        conn.close()
        return {"error": "Project not found"}

    cur.execute("SELECT COUNT(*) AS total FROM testcases WHERE project_id = %s;", (project_id,))
    total_testcases = cur.fetchone()["total"]

    cur.execute("SELECT status, COUNT(*) AS count FROM testcases WHERE project_id = %s GROUP BY status;", (project_id,))
    testcase_status = cur.fetchall()

    cur.execute("""
        SELECT COUNT(*) AS total
        FROM defects d
        JOIN testcases t ON d.testcase_id = t.id
        WHERE t.project_id = %s;
    """, (project_id,))
    total_defects = cur.fetchone()["total"]

    cur.execute("""
        SELECT d.status, COUNT(*) AS count
        FROM defects d
        JOIN testcases t ON d.testcase_id = t.id
        WHERE t.project_id = %s
        GROUP BY d.status;
    """, (project_id,))
    defect_status = cur.fetchall()

    cur.execute(f"""
        SELECT {TESTCASE_LIST_COLUMNS}
        FROM testcases
        WHERE project_id = %s
        ORDER BY id ASC
        LIMIT %s OFFSET %s;
    """, (project_id, testcases_limit, testcases_offset))
    testcases = cur.fetchall()

    cur.execute("""
        SELECT d.*
        FROM defects d
        JOIN testcases t ON d.testcase_id = t.id
        WHERE t.project_id = %s
        ORDER BY d.id ASC;
    """, (project_id,))
    defects = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "project": project,
        "total_testcases": total_testcases,
        "testcase_status": testcase_status,
        "total_defects": total_defects,
        "defect_status": defect_status,
        "testcases": testcases,
        "testcases_returned": len(testcases),
        "testcases_limit": testcases_limit,
        "testcases_offset": testcases_offset,
        "defects": defects
    }

@app.post("/projects")
def create_project(project: Project):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO projects (name, description) VALUES (%s, %s) RETURNING *;",
        (project.name, project.description)
    )
    new_project = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_project

@app.get("/testcases")
def get_testcases(
    project_id: Optional[int] = None,
    limit: int = DEFAULT_TESTCASE_LIST_LIMIT,
    offset: int = 0,
):
    conn = get_db_connection()
    cur = conn.cursor()
    query = f"""
        SELECT {TESTCASE_LIST_COLUMNS}
        FROM testcases
        WHERE status IN ('Generated', 'Approved', 'Review', 'Rejected', 'Draft', 'Passed', 'Failed', 'Blocked')
    """
    params: list = []
    if project_id is not None:
        query += " AND project_id = %s"
        params.append(project_id)
    query += " ORDER BY id ASC LIMIT %s OFFSET %s;"
    params.extend([limit, offset])

    cur.execute(query, tuple(params))
    testcases = cur.fetchall()
    cur.close()
    conn.close()
    return testcases

@app.put("/testcases/{testcase_id}/status")
def update_testcase_status(testcase_id: int, status_update: StatusUpdate):
    conn = get_db_connection()
    cur = conn.cursor()

    ensure_testcase_ai_columns(cur)

    manual_recommendation = status_update.status
    if status_update.status == "Approved":
        manual_recommendation = "Manual Approved"
    elif status_update.status == "Rejected":
        manual_recommendation = "Manual Rejected"

    cur.execute(
        """
        UPDATE testcases
        SET status = %s,
            ai_recommendation = %s
        WHERE id = %s
        RETURNING *;
        """,
        (status_update.status, manual_recommendation, testcase_id)
    )

    updated_testcase = cur.fetchone()
    conn.commit()

    cur.close()
    conn.close()

    if not updated_testcase:
        return {"error": "Test case not found"}

    return {
        "message": "Status updated successfully",
        "testcase": updated_testcase
    }

@app.post("/testcases")
def create_testcase(testcase: TestCase):
    conn = get_db_connection()
    cur = conn.cursor()

    ensure_testcase_ai_columns(cur)

    cur.execute(
        """
        INSERT INTO testcases
        (
            project_id,
            module,
            title,
            steps,
            expected_result,
            status,
            coverage_type,
            ai_quality_score,
            ai_review_remark,
            ai_recommendation
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *;
        """,
        (
            testcase.project_id,
            testcase.module,
            testcase.title,
            testcase.steps,
            testcase.expected_result,
            testcase.status,
            testcase.coverage_type,
            testcase.ai_quality_score,
            testcase.ai_review_remark,
            testcase.ai_recommendation,
        )
    )
    new_testcase = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_testcase

@app.put("/testcases/{testcase_id}/approve")
def approve_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE testcases
        SET status = 'Approved',
            approved_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (testcase_id,))

    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return updated

@app.put("/testcases/{testcase_id}/reject")
def reject_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE testcases
        SET status = 'Rejected'
        WHERE id = %s
        RETURNING *;
        """,
        (testcase_id,)
    )
    testcase = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return testcase

@app.put("/testcases/{testcase_id}/draft")
def draft_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE testcases
        SET status = 'Draft'
        WHERE id = %s
        RETURNING *;
        """,
        (testcase_id,)
    )
    testcase = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return testcase

@app.put("/testcases/{testcase_id}/pass")
def pass_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE testcases
        SET status = 'Passed',
            solved_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (testcase_id,))

    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return updated

@app.put("/testcases/{testcase_id}/fail")
def fail_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE testcases
        SET status = 'Failed',
            solved_at = NOW()
        WHERE id = %s
        RETURNING *;
    """, (testcase_id,))

    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return updated

@app.put("/testcases/{testcase_id}/block")
def block_testcase(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE testcases
        SET status = 'Blocked'
        WHERE id = %s
        RETURNING *;
    """, (testcase_id,))

    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return updated

@app.get("/defects")
def get_defects():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            d.id,
            d.testcase_id,
            t.project_id,
            d.defect_title,
            d.severity,
            d.status
        FROM defects d
        LEFT JOIN testcases t
            ON d.testcase_id = t.id
        ORDER BY d.id DESC;
    """)

    rows = cur.fetchall()

    result = []
    for row in rows:
        result.append({
            "id": row["id"],
            "testcase_id": row["testcase_id"],
            "project_id": row["project_id"],
            "defect_title": row["defect_title"],
            "severity": row["severity"],
            "status": row["status"],
        })

    cur.close()
    conn.close()

    return result




class DefectStatusUpdate(BaseModel):
    status: str


@app.put("/defects/{defect_id}/status")
def update_defect_status(defect_id: int, update: DefectStatusUpdate):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE defects
        SET
            status = %s,
            resolved_at = CASE
                WHEN %s IN ('Resolved', 'Closed') THEN NOW()
                ELSE resolved_at
            END
        WHERE id = %s
        RETURNING *;
        """,
        (update.status, update.status, defect_id)
    )

    defect = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return defect
@app.get("/defect-burndown")
def defect_burndown():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            DATE(created_at) AS day,
            COUNT(*) AS created
        FROM defects
        GROUP BY DATE(created_at)
        ORDER BY day;
    """)

    created_data = cur.fetchall()

    cur.execute("""
        SELECT
            DATE(resolved_at) AS day,
            COUNT(*) AS resolved
        FROM defects
        WHERE resolved_at IS NOT NULL
        GROUP BY DATE(resolved_at)
        ORDER BY day;
    """)

    resolved_data = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "created": created_data,
        "resolved": resolved_data
    }

@app.get("/test-runs")
def get_test_runs():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM test_runs ORDER BY id;")
    test_runs = cur.fetchall()
    cur.close()
    conn.close()
    return test_runs

@app.get("/dashboard-summary")
def get_dashboard_summary():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS count FROM projects;")
    total_projects = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) AS count FROM documents;")
    uploaded_documents = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) AS count FROM testcases;")
    generated_testcases = cur.fetchone()["count"]

    cur.execute("""
        SELECT COUNT(*) AS count
        FROM testcases
        WHERE status IN ('Approved', 'Passed', 'Failed', 'Blocked');
    """)
    approved_testcases = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) AS count FROM testcases WHERE status = 'Passed';")
    passed_tests = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) AS count FROM testcases WHERE status = 'Failed';")
    failed_tests = cur.fetchone()["count"]

    cur.execute("SELECT COUNT(*) AS count FROM testcases WHERE status = 'Blocked';")
    blocked_tests = cur.fetchone()["count"]

    cur.execute("""
        SELECT COUNT(*) AS count
        FROM defects
        WHERE status IN ('Open', 'In Progress');
    """)
    open_defects = cur.fetchone()["count"]

    cur.execute("""
        SELECT
            COALESCE(module, 'General') AS module,
            COUNT(*) AS failed_count
        FROM testcases
        WHERE status = 'Failed'
        GROUP BY COALESCE(module, 'General')
        ORDER BY failed_count DESC;
    """)
    module_failures = cur.fetchall()

    cur.close()
    conn.close()

    return {
        "total_projects": total_projects,
        "uploaded_documents": uploaded_documents,
        "generated_testcases": generated_testcases,
        "approved_testcases": approved_testcases,
        "passed_tests": passed_tests,
        "failed_tests": failed_tests,
        "blocked_tests": blocked_tests,
        "open_defects": open_defects,
        "module_failures": module_failures,
        "execution_summary": [
            {"name": "Passed", "value": passed_tests},
            {"name": "Failed", "value": failed_tests},
            {"name": "Blocked", "value": blocked_tests},
        ],
    }

@app.post("/test-runs")
def create_test_run(test_run: TestRun):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO test_runs
        (testcase_id, status, executed_by, comments)
        VALUES (%s, %s, %s, %s)
        RETURNING *;
        """,
        (
            test_run.testcase_id,
            test_run.status,
            test_run.executed_by,
            test_run.comments,
        )
    )
    new_test_run = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return new_test_run

@app.post("/upload-document")
async def upload_document(project_id: int = Form(...), file: UploadFile = File(...)):
    contents = await file.read()

    pdf_reader = PdfReader(io.BytesIO(contents))
    extracted_text = ""

    for page in pdf_reader.pages:
        extracted_text += page.extract_text() or ""

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO documents
        (project_id, filename, extracted_text)
        VALUES (%s, %s, %s)
        RETURNING *;
        """,
        (project_id, file.filename, extracted_text)
    )

    new_document = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return {
        "message": "Document uploaded and text extracted successfully",
        "document": new_document
    }

def render_steps_text(case: AITestCase) -> str:
    if not case.steps:
        return case.steps_text or ""
    return "\n".join(f"{s.step}. {s.action} -> Expected: {s.expected_result}" for s in case.steps)


@app.post("/generate-testcases")
def generate_testcases(request: GenerateTestCasesRequest):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM documents WHERE id = %s;", (request.document_id,))
    document = cur.fetchone()

    if not document:
        cur.close()
        conn.close()
        return {"error": "Document not found"}

    requirement_text = document.get("extracted_text") or ""
    if not requirement_text.strip():
        cur.close()
        conn.close()
        return {"error": "Document has no extracted text to generate test cases from"}

    try:
        result = ai_services.generate_testcases_from_requirement(requirement_text)
    except Exception as error:
        cur.close()
        conn.close()
        return {"error": f"AI generation failed: {error}"}

    cases: list[AITestCase] = result["cases"]
    if not cases:
        cur.close()
        conn.close()
        return {
            "error": "AI response did not contain any valid test cases",
            "validation_errors": result["validation_errors"],
        }

    ensure_testcase_ai_columns(cur)
    ensure_execution_schema(cur)

    cur.execute(
        "SELECT title FROM testcases WHERE project_id = %s;",
        (document["project_id"],)
    )
    existing_titles = {normalize_for_duplicate(row["title"]) for row in cur.fetchall()}

    created_testcases = []
    skipped_duplicates = 0

    for case in cases:
        title = case.title.strip()
        if not title:
            continue

        normalized_title = normalize_for_duplicate(title)
        if normalized_title in existing_titles:
            skipped_duplicates += 1
            continue
        existing_titles.add(normalized_title)

        requirement_match = to_boolean(case.requirement_match if case.requirement_match is not None else True)
        ai_quality_score = safe_int(case.ai_quality_score)
        status = decide_auto_status(requirement_match, ai_quality_score)
        ai_recommendation = build_ai_recommendation(status)

        cur.execute(
            """
            INSERT INTO testcases
            (
                project_id,
                module,
                title,
                steps,
                expected_result,
                status,
                coverage_type,
                ai_quality_score,
                ai_review_remark,
                ai_recommendation,
                ai_test_case,
                role,
                automatable,
                requires_credentials
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (
                document["project_id"],
                case.module or "General",
                title,
                render_steps_text(case),
                case.expected_final_state or case.expected_result or "",
                status,
                case.coverage_type or case.type,
                ai_quality_score,
                f"Requirement match: {requirement_match}",
                ai_recommendation,
                case.model_dump_json(),
                case.role,
                case.automation.automatable,
                case.automation.requires_credentials,
            )
        )
        created_testcases.append(cur.fetchone())

    conn.commit()
    cur.close()
    conn.close()

    return {
        "message": "AI test cases generated successfully",
        "created_count": len(created_testcases),
        "skipped_duplicates": skipped_duplicates,
        "skipped_invalid": len(result["validation_errors"]),
        "coverage_report": result["coverage_report"],
        "testcases": created_testcases,
    }


# ---------------------------------------------------------------------------
# Execution pipeline: environment settings, credentials, script generation
# ---------------------------------------------------------------------------

@app.put("/projects/{project_id}/base-url")
def update_base_url(project_id: int, update: BaseUrlUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    ensure_execution_schema(cur)
    cur.execute("UPDATE projects SET base_url = %s WHERE id = %s RETURNING *;", (update.base_url, project_id))
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not updated:
        return {"error": "Project not found"}
    return updated


@app.get("/projects/{project_id}/credentials")
def list_credentials(project_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT role, created_at FROM test_credentials WHERE project_id = %s ORDER BY role;", (project_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"role": r["role"], "has_credentials": True, "created_at": r["created_at"]} for r in rows]


@app.post("/projects/{project_id}/credentials")
def set_credentials(project_id: int, credential: CredentialIn):
    if not crypto.credentials_configured():
        return {"error": "CREDENTIAL_ENCRYPTION_KEY is not configured on the server"}

    username_encrypted = crypto.encrypt_value(credential.username)
    password_encrypted = crypto.encrypt_value(credential.password)

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO test_credentials (project_id, role, username_encrypted, password_encrypted)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (project_id, role) DO UPDATE
        SET username_encrypted = EXCLUDED.username_encrypted, password_encrypted = EXCLUDED.password_encrypted
        RETURNING role, created_at;
    """, (project_id, credential.role, username_encrypted, password_encrypted))
    saved = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"role": saved["role"], "has_credentials": True}


@app.delete("/projects/{project_id}/credentials/{role}")
def delete_credentials(project_id: int, role: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM test_credentials WHERE project_id = %s AND role = %s RETURNING role;", (project_id, role))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        return {"error": "No credentials found for that role"}
    return {"message": "Credentials removed", "role": role}


def _parse_ai_test_case(raw) -> AITestCase:
    if isinstance(raw, str):
        raw = json.loads(raw)
    return AITestCase.model_validate(raw)


@app.post("/testcases/{testcase_id}/generate-script")
async def generate_script(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT t.*, p.base_url FROM testcases t JOIN projects p ON p.id = t.project_id WHERE t.id = %s;",
        (testcase_id,)
    )
    testcase = cur.fetchone()
    if not testcase:
        cur.close()
        conn.close()
        return {"error": "Test case not found"}
    if not testcase.get("base_url"):
        cur.close()
        conn.close()
        return {"error": "Project has no base_url configured. Set it in Test Environment settings first."}
    if not testcase.get("ai_test_case"):
        cur.close()
        conn.close()
        return {"error": "This test case was not generated with the structured AI schema; cannot auto-generate a script"}

    ai_case = _parse_ai_test_case(testcase["ai_test_case"])

    browser = playwright_context.get("browser")
    if not browser:
        cur.close()
        conn.close()
        return {"error": "Browser not ready yet, try again shortly"}

    try:
        dom_summary = await browser_exploration.explore_page(testcase["base_url"], browser)
    except Exception as exc:
        cur.close()
        conn.close()
        return {"error": f"Could not explore target site: {exc}"}

    try:
        script_code = ai_services.generate_playwright_script(ai_case, dom_summary, testcase["base_url"])
    except Exception as exc:
        cur.close()
        conn.close()
        return {"error": f"Script generation failed: {exc}"}

    cur.execute("UPDATE generated_scripts SET status = 'STALE' WHERE testcase_id = %s AND status = 'ACTIVE';", (testcase_id,))
    cur.execute("""
        INSERT INTO generated_scripts (testcase_id, script_code, target_url, dom_snapshot_summary, generation_model, status)
        VALUES (%s, %s, %s, %s, %s, 'ACTIVE')
        RETURNING *;
    """, (testcase_id, script_code, testcase["base_url"], dom_summary, ai_services.AI_PROVIDER))
    new_script = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Script generated", "script": new_script}


@app.get("/testcases/{testcase_id}/script")
def get_script(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM generated_scripts WHERE testcase_id = %s AND status = 'ACTIVE'
        ORDER BY id DESC LIMIT 1;
    """, (testcase_id,))
    script = cur.fetchone()
    cur.close()
    conn.close()
    if not script:
        return {"error": "No active generated script for this test case"}
    return script


# ---------------------------------------------------------------------------
# Execution pipeline: run / cancel / results
# ---------------------------------------------------------------------------

@app.post("/testcases/{testcase_id}/run")
async def run_testcase_endpoint(testcase_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id FROM generated_scripts WHERE testcase_id = %s AND status = 'ACTIVE'
        ORDER BY id DESC LIMIT 1;
    """, (testcase_id,))
    script = cur.fetchone()
    if not script:
        cur.close()
        conn.close()
        return {"error": "No active generated script for this test case. Generate one first."}

    cur.execute("""
        INSERT INTO test_executions (testcase_id, generated_script_id, status)
        VALUES (%s, %s, 'QUEUED')
        RETURNING id;
    """, (testcase_id, script["id"]))
    execution_id = cur.fetchone()["id"]
    conn.commit()
    cur.close()
    conn.close()

    await execution_queue.put(execution_id)
    return {"execution_id": execution_id, "status": "QUEUED"}


@app.post("/test-executions/{execution_id}/cancel")
def cancel_execution(execution_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE test_executions SET status = 'CANCELLED', finished_at = NOW()
        WHERE id = %s AND status = 'QUEUED'
        RETURNING *;
    """, (execution_id,))
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not updated:
        return {"error": "Execution not found, already running, or already finished"}
    return updated


@app.get("/test-executions/{execution_id}")
def get_execution(execution_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM test_executions WHERE id = %s;", (execution_id,))
    execution = cur.fetchone()
    if not execution:
        cur.close()
        conn.close()
        return {"error": "Execution not found"}
    cur.execute("SELECT * FROM test_step_results WHERE execution_id = %s ORDER BY step_number;", (execution_id,))
    steps = cur.fetchall()
    cur.execute("SELECT * FROM test_artifacts WHERE execution_id = %s ORDER BY id;", (execution_id,))
    artifacts = cur.fetchall()
    cur.close()
    conn.close()
    return {"execution": execution, "steps": steps, "artifacts": artifacts}


@app.get("/test-executions")
def list_executions(project_id: Optional[int] = None, testcase_id: Optional[int] = None, status: Optional[str] = None):
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT te.*, t.title AS testcase_title, t.project_id
        FROM test_executions te
        JOIN testcases t ON t.id = te.testcase_id
        WHERE 1=1
    """
    params = []
    if project_id is not None:
        query += " AND t.project_id = %s"
        params.append(project_id)
    if testcase_id is not None:
        query += " AND te.testcase_id = %s"
        params.append(testcase_id)
    if status is not None:
        query += " AND te.status = %s"
        params.append(status)
    query += " ORDER BY te.id DESC;"
    cur.execute(query, tuple(params))
    executions = cur.fetchall()
    cur.close()
    conn.close()
    return executions


# ---------------------------------------------------------------------------
# Live execution WebSocket
# ---------------------------------------------------------------------------

def _now():
    return datetime.now(timezone.utc).isoformat()


def _jsonable_row(row):
    if row is None:
        return None
    result = {}
    for key, value in dict(row).items():
        result[key] = value.isoformat() if isinstance(value, datetime) else value
    return result


async def publish_execution_event(execution_id: int, event: dict):
    for ws in list(active_connections.get(execution_id, [])):
        try:
            await ws.send_json(event)
        except Exception:
            active_connections.get(execution_id, set()).discard(ws)


@app.websocket("/ws/executions/{execution_id}")
async def ws_execution(websocket: WebSocket, execution_id: int):
    await websocket.accept()
    active_connections.setdefault(execution_id, set()).add(websocket)
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM test_executions WHERE id = %s;", (execution_id,))
        execution = cur.fetchone()
        cur.execute("SELECT * FROM test_step_results WHERE execution_id = %s ORDER BY step_number;", (execution_id,))
        steps = cur.fetchall()
        cur.close()
        conn.close()
        await websocket.send_json({
            "type": "SNAPSHOT",
            "execution": _jsonable_row(execution),
            "steps": [_jsonable_row(s) for s in steps],
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.get(execution_id, set()).discard(websocket)


# ---------------------------------------------------------------------------
# Execution worker (in-process asyncio queue, single browser instance)
# ---------------------------------------------------------------------------

def resolve_credentials(cur, project_id: int):
    """Returns (data, secret_values): data maps credential placeholder tokens
    to decrypted values; secret_values is the flat list used for masking
    persisted text. Both {{ROLE_USERNAME}} and {ROLE_USERNAME}} spellings are
    included since generated scripts don't always use the exact double-brace
    form requested in the codegen prompt."""
    data = {}
    secret_values = []
    cur.execute(
        "SELECT role, username_encrypted, password_encrypted FROM test_credentials WHERE project_id = %s;",
        (project_id,)
    )
    for row in cur.fetchall():
        role_key = row["role"].strip().upper().replace(" ", "_")
        try:
            username = crypto.decrypt_value(row["username_encrypted"])
            password = crypto.decrypt_value(row["password_encrypted"])
        except Exception:
            continue
        for field, value in (("USERNAME", username), ("PASSWORD", password)):
            data[f"{{{{{role_key}_{field}}}}}"] = value  # {{ROLE_FIELD}}
            data[f"{{{role_key}_{field}}}"] = value        # {ROLE_FIELD}
        secret_values.extend([username, password])
    return data, secret_values


async def run_execution(execution_id: int):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT status FROM test_executions WHERE id = %s;", (execution_id,))
    current = cur.fetchone()
    if not current or current["status"] == "CANCELLED":
        cur.close()
        conn.close()
        return

    cur.execute("""
        SELECT te.*, gs.script_code, gs.target_url, gs.dom_snapshot_summary,
               t.title AS testcase_title, t.ai_test_case AS testcase_ai_case, t.project_id AS project_id
        FROM test_executions te
        JOIN testcases t ON t.id = te.testcase_id
        LEFT JOIN generated_scripts gs ON gs.id = te.generated_script_id
        WHERE te.id = %s;
    """, (execution_id,))
    execution = cur.fetchone()

    if not execution or not execution["script_code"]:
        cur.execute("""
            UPDATE test_executions SET status = 'ERROR', failure_summary = %s, finished_at = NOW()
            WHERE id = %s;
        """, ("No generated script found; generate one first", execution_id))
        conn.commit()
        cur.close()
        conn.close()
        await publish_execution_event(execution_id, {
            "type": "TEST_ERROR", "execution_id": execution_id,
            "failure_summary": "No generated script found", "ts": _now(),
        })
        return

    steps_by_number = {}
    if execution["testcase_ai_case"]:
        try:
            ai_case = _parse_ai_test_case(execution["testcase_ai_case"])
            steps_by_number = {s.step: s for s in ai_case.steps}
        except Exception:
            steps_by_number = {}

    cur.execute("UPDATE test_executions SET status = 'RUNNING', started_at = NOW() WHERE id = %s;", (execution_id,))
    conn.commit()
    await publish_execution_event(execution_id, {
        "type": "TEST_STARTED", "execution_id": execution_id,
        "testcase_id": execution["testcase_id"], "ts": _now(),
    })

    resolved_data, secret_values = resolve_credentials(cur, execution["project_id"])

    steps_log = []
    status = "PASSED"
    failure_classification = None
    failure_summary = None
    any_step_reported = False

    browser = playwright_context["browser"]
    context = await browser.new_context()
    page = await context.new_page()
    artifact_dir = os.path.join(ARTIFACTS_DIR, str(execution_id))
    os.makedirs(artifact_dir, exist_ok=True)
    trace_path = os.path.join(artifact_dir, "trace.zip")
    await context.tracing.start(screenshots=True, snapshots=True)

    async def report_step(step_number, step_status, actual_result):
        nonlocal any_step_reported, status
        any_step_reported = True
        step_status = "PASSED" if str(step_status).upper() == "PASSED" else "FAILED"
        masked_actual = crypto.mask_secrets(str(actual_result), secret_values)
        planned = steps_by_number.get(step_number)

        cur.execute("""
            INSERT INTO test_step_results
                (execution_id, step_number, action, expected_result, actual_result, status, started_at, finished_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id;
        """, (
            execution_id, step_number,
            planned.action if planned else None,
            planned.expected_result if planned else None,
            masked_actual, step_status,
        ))
        step_row = cur.fetchone()
        conn.commit()
        steps_log.append({"step": step_number, "status": step_status, "actual_result": masked_actual})

        if step_status == "FAILED":
            status = "FAILED"
            screenshot_rel = f"{execution_id}/step_{step_number}_failure.png"
            try:
                await page.screenshot(path=os.path.join(ARTIFACTS_DIR, screenshot_rel))
                cur.execute("""
                    INSERT INTO test_artifacts (execution_id, step_result_id, artifact_type, file_path)
                    VALUES (%s, %s, 'SCREENSHOT', %s);
                """, (execution_id, step_row["id"], f"/artifacts/{screenshot_rel}"))
                conn.commit()
            except Exception:
                pass

        await publish_execution_event(execution_id, {
            "type": "STEP_PASSED" if step_status == "PASSED" else "STEP_FAILED",
            "execution_id": execution_id, "step_number": step_number,
            "actual_result": masked_actual, "ts": _now(),
        })

    try:
        # Pre-populate the exec namespace with the names generated scripts are
        # told to use for assertions (expect(...)), so a script works even if
        # the model didn't write its own import line.
        namespace: dict = {"expect": playwright_expect, "asyncio": asyncio}
        exec(compile(execution["script_code"], f"<generated_script_{execution['testcase_id']}>", "exec"), namespace)
        run_fn = namespace.get("run")
        if not callable(run_fn):
            raise RuntimeError("Generated script does not define an async run(page, data, report_step) function")
        await asyncio.wait_for(run_fn(page, resolved_data, report_step), timeout=120)
    except asyncio.TimeoutError:
        status = "ERROR"
        failure_classification = "ENVIRONMENT_ERROR" if not any_step_reported else "ERROR"
        failure_summary = "Script execution timed out"
    except PlaywrightTimeoutError as exc:
        status = "ERROR"
        failure_classification = "ENVIRONMENT_ERROR" if not any_step_reported else "ERROR"
        failure_summary = crypto.mask_secrets(f"Timeout: {exc}", secret_values)
    except Exception as exc:
        status = "BLOCKED" if not any_step_reported else "ERROR"
        failure_classification = "ENVIRONMENT_ERROR" if status == "BLOCKED" else None
        failure_summary = crypto.mask_secrets(f"{type(exc).__name__}: {exc}", secret_values)
    finally:
        try:
            await context.tracing.stop(path=trace_path)
            cur.execute("""
                INSERT INTO test_artifacts (execution_id, artifact_type, file_path)
                VALUES (%s, 'TRACE', %s);
            """, (execution_id, f"/artifacts/{execution_id}/trace.zip"))
            conn.commit()
        except Exception:
            pass
        await context.close()

    failure_analysis_data = None
    if status in ("FAILED", "ERROR"):
        analysis = ai_services.analyze_failure(
            execution["testcase_title"], steps_log, execution["dom_snapshot_summary"] or ""
        )
        if analysis:
            failure_analysis_data = analysis.model_dump()
            failure_summary = failure_summary or analysis.likely_cause

    cur.execute("""
        UPDATE test_executions
        SET status = %s, finished_at = NOW(), failure_classification = %s,
            failure_summary = %s, failure_analysis = %s
        WHERE id = %s;
    """, (
        status, failure_classification, failure_summary,
        json.dumps(failure_analysis_data) if failure_analysis_data else None,
        execution_id,
    ))
    cur.execute(
        "UPDATE testcases SET latest_execution_status = %s, latest_execution_id = %s WHERE id = %s;",
        (status, execution_id, execution["testcase_id"])
    )
    conn.commit()
    cur.close()
    conn.close()

    await publish_execution_event(execution_id, {
        "type": f"TEST_{status}", "execution_id": execution_id,
        "failure_summary": failure_summary, "ts": _now(),
    })


async def execution_worker_loop():
    while True:
        execution_id = await execution_queue.get()
        try:
            await run_execution(execution_id)
        except Exception:
            traceback.print_exc()
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("""
                    UPDATE test_executions SET status = 'ERROR', failure_summary = 'Worker crashed', finished_at = NOW()
                    WHERE id = %s;
                """, (execution_id,))
                conn.commit()
                cur.close()
                conn.close()
            except Exception:
                pass
        finally:
            execution_queue.task_done()


@app.on_event("startup")
async def on_startup():
    conn = get_db_connection()
    cur = conn.cursor()
    ensure_testcase_ai_columns(cur)
    ensure_execution_schema(cur)
    conn.commit()

    cur.execute("""
        UPDATE test_executions SET status = 'ERROR', failure_summary = 'Server restarted mid-run', finished_at = NOW()
        WHERE status = 'RUNNING';
    """)
    conn.commit()
    cur.execute("SELECT id FROM test_executions WHERE status = 'QUEUED' ORDER BY id;")
    queued_ids = [row["id"] for row in cur.fetchall()]
    cur.close()
    conn.close()

    pw = await async_playwright().start()
    playwright_context["pw"] = pw
    playwright_context["browser"] = await pw.chromium.launch(headless=True)

    for execution_id in queued_ids:
        await execution_queue.put(execution_id)

    asyncio.create_task(execution_worker_loop())


@app.on_event("shutdown")
async def on_shutdown():
    browser = playwright_context.get("browser")
    if browser:
        await browser.close()
    pw = playwright_context.get("pw")
    if pw:
        await pw.stop()
