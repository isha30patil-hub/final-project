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
