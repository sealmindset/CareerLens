-- Migration: Add agent context, enhanced debrief fields, and api_id sequences
-- Date: 2026-05-05

BEGIN;

ALTER TABLE interview_sim_sessions
    ADD COLUMN IF NOT EXISTS agent_context JSONB;

ALTER TABLE interview_sim_debriefs
    ADD COLUMN IF NOT EXISTS story_utilization TEXT,
    ADD COLUMN IF NOT EXISTS gap_correlation TEXT;

-- Fix api_id auto-increment for all interview_sim tables
-- (autoincrement=True in SQLAlchemy only works for primary keys)
CREATE SEQUENCE IF NOT EXISTS interview_sim_sessions_api_id_seq OWNED BY interview_sim_sessions.api_id;
ALTER TABLE interview_sim_sessions ALTER COLUMN api_id SET DEFAULT nextval('interview_sim_sessions_api_id_seq');
SELECT setval('interview_sim_sessions_api_id_seq', COALESCE((SELECT MAX(api_id) FROM interview_sim_sessions), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS interview_sim_questions_api_id_seq OWNED BY interview_sim_questions.api_id;
ALTER TABLE interview_sim_questions ALTER COLUMN api_id SET DEFAULT nextval('interview_sim_questions_api_id_seq');
SELECT setval('interview_sim_questions_api_id_seq', COALESCE((SELECT MAX(api_id) FROM interview_sim_questions), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS interview_sim_responses_api_id_seq OWNED BY interview_sim_responses.api_id;
ALTER TABLE interview_sim_responses ALTER COLUMN api_id SET DEFAULT nextval('interview_sim_responses_api_id_seq');
SELECT setval('interview_sim_responses_api_id_seq', COALESCE((SELECT MAX(api_id) FROM interview_sim_responses), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS interview_sim_debriefs_api_id_seq OWNED BY interview_sim_debriefs.api_id;
ALTER TABLE interview_sim_debriefs ALTER COLUMN api_id SET DEFAULT nextval('interview_sim_debriefs_api_id_seq');
SELECT setval('interview_sim_debriefs_api_id_seq', COALESCE((SELECT MAX(api_id) FROM interview_sim_debriefs), 0) + 1, false);

COMMIT;
