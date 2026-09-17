from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from PyPDF2 import PdfReader
import io
import json
import re
import google.generativeai as genai
import os
import requests
from dotenv import load_dotenv
from openai import OpenAI
import anthropic
from typing import Optional
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")

load_dotenv(ENV_PATH, override=True)

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower().strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"').strip("'")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip().strip('"').strip("'")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5").strip()

print("ENV PATH:", ENV_PATH)
print("AI_PROVIDER:", AI_PROVIDER)
print("GEMINI KEY LOADED:", bool(GEMINI_API_KEY))
print("GEMINI KEY LENGTH:", len(GEMINI_API_KEY))

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    return psycopg2.connect(
        host="localhost",
        database="testai",
        user="postgres",
        password="admin123",
        port=5432,
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
def get_project_summary(project_id: int):
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

    cur.execute("""
        SELECT *
        FROM testcases
        WHERE project_id = %s
        ORDER BY id ASC;
    """, (project_id,))
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
def get_testcases():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT *
        FROM testcases
        WHERE status IN ('Generated', 'Approved', 'Review', 'Rejected', 'Draft', 'Passed', 'Failed', 'Blocked')
        ORDER BY id ASC;
    """)
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

def extract_json_from_ai_response(text):
    
    cleaned = text.strip()
    cleaned = re.sub(r"```json", "", cleaned)
    cleaned = re.sub(r"```", "", cleaned)
    return json.loads(cleaned)
def generate_ai_response(prompt: str):
    print("USING AI_PROVIDER:", AI_PROVIDER)
    print("INSIDE FUNCTION GEMINI KEY LOADED:", bool(GEMINI_API_KEY))
    print("INSIDE FUNCTION GEMINI KEY LENGTH:", len(GEMINI_API_KEY))

    if AI_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            raise Exception("Gemini API key is missing")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        }

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2
            }
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

        response = openai_client.responses.create(
            model=OPENAI_MODEL,
            input=prompt,
        )

        return response.output_text

    if AI_PROVIDER == "claude":
        if not anthropic_client:
            raise Exception("Claude API key is missing")

        response = anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=3000,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        return response.content[0].text

    raise Exception("Invalid AI provider selected")