ALTER TABLE document_chunks
  ADD COLUMN quality_score FLOAT NOT NULL DEFAULT 1.0;

CREATE TABLE chat_feedback (
  feedback_id  UUID        NOT NULL DEFAULT gen_random_uuid(),
  chunk_ids    UUID[]      NOT NULL DEFAULT '{}',
  feedback     VARCHAR(4)  NULL,
  question     TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_feedback_pkey PRIMARY KEY (feedback_id)
);
