CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    extracted_text TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testcases (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module VARCHAR(100) DEFAULT 'General',
    title TEXT NOT NULL,
    steps TEXT,
    expected_result TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Generated',
    coverage_type VARCHAR(50),
    ai_quality_score INTEGER,
    ai_review_remark TEXT,
    ai_recommendation VARCHAR(20),
    approved_at TIMESTAMP,
    solved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS defects (
    id SERIAL PRIMARY KEY,
    testcase_id INTEGER NOT NULL REFERENCES testcases(id) ON DELETE CASCADE,
    defect_title TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
    id SERIAL PRIMARY KEY,
    testcase_id INTEGER NOT NULL REFERENCES testcases(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    executed_by VARCHAR(100),
    comments TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Execution pipeline tables (added for automated Playwright execution).
-- Kept in sync by hand with ensure_execution_schema() in main.py.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS base_url TEXT;

ALTER TABLE testcases
    ADD COLUMN IF NOT EXISTS latest_execution_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS latest_execution_id INTEGER,
    ADD COLUMN IF NOT EXISTS ai_test_case JSONB,
    ADD COLUMN IF NOT EXISTS role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS automatable BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS requires_credentials BOOLEAN NOT NULL DEFAULT FALSE;

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
CREATE INDEX IF NOT EXISTS idx_generated_scripts_testcase ON generated_scripts(testcase_id);

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
CREATE INDEX IF NOT EXISTS idx_test_executions_testcase ON test_executions(testcase_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_status ON test_executions(status);

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
CREATE INDEX IF NOT EXISTS idx_test_step_results_execution ON test_step_results(execution_id);

CREATE TABLE IF NOT EXISTS test_artifacts (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    step_result_id INTEGER REFERENCES test_step_results(id) ON DELETE CASCADE,
    artifact_type VARCHAR(20) NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_artifacts_execution ON test_artifacts(execution_id);

CREATE TABLE IF NOT EXISTS test_credentials (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    username_encrypted TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, role)
);
