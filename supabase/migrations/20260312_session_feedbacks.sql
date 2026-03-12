-- Table: session_feedbacks
-- Stores athlete feedback per session (general + per-block).
-- The coach can read all rows; athletes manage only their own.

CREATE TABLE IF NOT EXISTS session_feedbacks (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_name   TEXT,
  session_id     INT,                       -- NULL for custom / unnamed sessions
  session_name   TEXT        NOT NULL,
  feedback_date  DATE        NOT NULL,
  week_key       TEXT,                      -- e.g. "2026-W10"
  done           BOOLEAN,
  rpe            INT,
  quality        INT,
  notes          TEXT,
  block_feedbacks JSONB,                    -- [{ blockId, blockName, text }]
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, session_name, feedback_date)
);

ALTER TABLE session_feedbacks ENABLE ROW LEVEL SECURITY;

-- Athletes can create / update / delete their own feedbacks
CREATE POLICY "Users manage own feedbacks"
  ON session_feedbacks FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- All authenticated users can read all feedbacks (coach access)
-- TODO: once role system exists, restrict to coach role
CREATE POLICY "Authenticated users read all feedbacks"
  ON session_feedbacks FOR SELECT
  USING (auth.role() = 'authenticated');
