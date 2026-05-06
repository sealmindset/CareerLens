-- Interview Simulator -- initial schema
-- Runs against the shared CareerLens PostgreSQL database

BEGIN;

CREATE TABLE IF NOT EXISTS interview_sim_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    user_id UUID NOT NULL,
    application_id UUID,
    job_title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    job_description TEXT,
    interviewer_context TEXT,
    interview_style VARCHAR(30) NOT NULL DEFAULT 'behavioral',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    question_count INT NOT NULL DEFAULT 10,
    overall_score JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_sim_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    session_id UUID NOT NULL REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    question_index INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(30),
    expected_signals TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_sim_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    question_id UUID NOT NULL REFERENCES interview_sim_questions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    duration_ms INT,
    filler_word_count INT DEFAULT 0,
    filler_words JSONB,
    silence_gaps JSONB,
    pace_wpm INT,
    clarity_score FLOAT,
    specificity_score FLOAT,
    confidence_score FLOAT,
    structure_score FLOAT,
    example_quality VARCHAR(20),
    evaluator_notes TEXT,
    stalled BOOLEAN DEFAULT FALSE,
    was_nudged BOOLEAN DEFAULT FALSE,
    trailing_off_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_sim_debriefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    session_id UUID NOT NULL UNIQUE REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    overall_score INT,
    clarity_score INT,
    specificity_score INT,
    confidence_score INT,
    structure_score INT,
    conciseness_score INT,
    what_landed TEXT,
    what_missed TEXT,
    portfolio_gaps TEXT,
    improvement_plan TEXT,
    exported_to_workspace BOOLEAN DEFAULT FALSE,
    workspace_artifact_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_sessions_user ON interview_sim_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sim_sessions_app ON interview_sim_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_sim_questions_session ON interview_sim_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_sim_responses_session ON interview_sim_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_sim_responses_question ON interview_sim_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_sim_debriefs_user ON interview_sim_debriefs(user_id);

COMMIT;
