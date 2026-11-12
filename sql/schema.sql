-- Relational model (3NF): projects 1---* tasks
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() on older PG

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title       VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  status      VARCHAR(20)  NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo','in_progress','done')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres does NOT auto-index FK columns: index it (join + cascade-delete speed)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id        ON tasks (project_id);
-- Common filter: "open tasks in project X"
CREATE INDEX IF NOT EXISTS idx_tasks_project_status    ON tasks (project_id, status);
