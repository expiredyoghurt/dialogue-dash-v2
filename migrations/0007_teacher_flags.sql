-- Dialogue Dash 2.0.0: new teacher accounts (and reset passwords) must be changed at first sign-in.
-- Safe to run before deploying and any number of times. Nothing existing is changed.
CREATE TABLE IF NOT EXISTS teacher_flags (
  teacher_id INTEGER PRIMARY KEY,
  must_change INTEGER NOT NULL DEFAULT 0     -- 1 = choose a new password before doing anything else
);
INSERT INTO meta (k, v) VALUES ('schema_version', 7) ON CONFLICT(k) DO UPDATE SET v = 7;
