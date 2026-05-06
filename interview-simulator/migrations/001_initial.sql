-- ============================================================================
-- Migration 001: Initial Interview Simulator Schema
-- Description: Creates the four core interview simulator tables:
--              interview_sim_sessions, interview_sim_questions,
--              interview_sim_responses, interview_sim_debriefs
-- Date: 2026-05-05
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. interview_sim_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sim_sessions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id          BIGSERIAL       UNIQUE NOT NULL,
    user_id         UUID            NOT NULL,
    application_id  UUID,
    job_title       VARCHAR(255)    NOT NULL,
    company         VARCHAR(255)    NOT NULL,
    job_description TEXT,
    interviewer_context TEXT,
    interview_style VARCHAR(30)     NOT NULL DEFAULT 'behavioral',
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    question_count  INTEGER         NOT NULL DEFAULT 10,
    overall_score   JSONB,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_interview_sim_sessions_user_id
    ON interview_sim_sessions (user_id);

CREATE INDEX IF NOT EXISTS ix_interview_sim_sessions_status
    ON interview_sim_sessions (status);

-- ---------------------------------------------------------------------------
-- 2. interview_sim_questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sim_questions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id          BIGSERIAL       UNIQUE NOT NULL,
    session_id      UUID            NOT NULL
                        REFERENCES interview_sim_sessions (id) ON DELETE CASCADE,
    question_index  INTEGER         NOT NULL,
    question_text   TEXT            NOT NULL,
    question_type   VARCHAR(30),
    expected_signals TEXT[],
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_interview_sim_questions_session_id
    ON interview_sim_questions (session_id);

CREATE INDEX IF NOT EXISTS ix_interview_sim_questions_question_index
    ON interview_sim_questions (question_index);

-- ---------------------------------------------------------------------------
-- 3. interview_sim_responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sim_responses (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id              BIGSERIAL       UNIQUE NOT NULL,
    question_id         UUID            NOT NULL
                            REFERENCES interview_sim_questions (id) ON DELETE CASCADE,
    session_id          UUID            NOT NULL
                            REFERENCES interview_sim_sessions (id) ON DELETE CASCADE,
    transcript          TEXT            NOT NULL,
    duration_ms         INTEGER,

    -- Communication metrics
    filler_word_count   INTEGER         NOT NULL DEFAULT 0,
    filler_words        JSONB,
    silence_gaps        JSONB,
    pace_wpm            INTEGER,

    -- AI evaluation scores (0.0 - 1.0)
    clarity_score       DOUBLE PRECISION,
    specificity_score   DOUBLE PRECISION,
    confidence_score    DOUBLE PRECISION,
    structure_score     DOUBLE PRECISION,
    example_quality     VARCHAR(20),
    evaluator_notes     TEXT,

    -- Behavioural signals
    stalled             BOOLEAN         NOT NULL DEFAULT FALSE,
    was_nudged          BOOLEAN         NOT NULL DEFAULT FALSE,
    trailing_off_count  INTEGER         NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_interview_sim_responses_question_id
    ON interview_sim_responses (question_id);

CREATE INDEX IF NOT EXISTS ix_interview_sim_responses_session_id
    ON interview_sim_responses (session_id);

-- ---------------------------------------------------------------------------
-- 4. interview_sim_debriefs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sim_debriefs (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id                  BIGSERIAL       UNIQUE NOT NULL,
    session_id              UUID            NOT NULL UNIQUE
                                REFERENCES interview_sim_sessions (id) ON DELETE CASCADE,
    user_id                 UUID            NOT NULL,

    -- Scores (0-100)
    overall_score           INTEGER,
    clarity_score           INTEGER,
    specificity_score       INTEGER,
    confidence_score        INTEGER,
    structure_score         INTEGER,
    conciseness_score       INTEGER,

    -- Qualitative (markdown)
    what_landed             TEXT,
    what_missed             TEXT,
    portfolio_gaps          TEXT,
    improvement_plan        TEXT,

    -- Export tracking
    exported_to_workspace   BOOLEAN         NOT NULL DEFAULT FALSE,
    workspace_artifact_id   UUID,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_interview_sim_debriefs_session_id
    ON interview_sim_debriefs (session_id);

CREATE INDEX IF NOT EXISTS ix_interview_sim_debriefs_user_id
    ON interview_sim_debriefs (user_id);

COMMIT;
