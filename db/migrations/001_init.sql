-- TaskBid schema: tables, constraints, indexes, audit triggers.
-- Enforced at the database: bid uniqueness, own-task bidding, capacity,
-- bidding window, and forward-only task status.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE task_status AS ENUM (
  'draft',
  'open',
  'bidding_closed',
  'assigned',
  'in_progress',
  'review',
  'done'
);

CREATE TYPE bid_status AS ENUM (
  'active',
  'won',
  'skipped_no_capacity'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  hourly_rate NUMERIC(10, 2) NOT NULL CHECK (hourly_rate >= 0),
  max_capacity NUMERIC(10, 2) NOT NULL CHECK (max_capacity > 0),
  current_workload NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (current_workload >= 0 AND current_workload <= max_capacity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  complexity SMALLINT NOT NULL CHECK (complexity BETWEEN 1 AND 5),
  status task_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users (id),
  assigned_to UUID REFERENCES users (id),
  assigned_hours NUMERIC(10, 2),
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assigned_requires_assignee CHECK (
    (status IN ('assigned', 'in_progress', 'review', 'done') AND assigned_to IS NOT NULL AND assigned_hours IS NOT NULL)
    OR (status IN ('draft', 'open', 'bidding_closed') AND assigned_to IS NULL AND assigned_hours IS NULL)
  )
);

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id),
  hours NUMERIC(10, 2) NOT NULL CHECK (hours > 0),
  status bid_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_bid_per_user_per_task UNIQUE (task_id, user_id)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_created_by ON tasks (created_by);
CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX idx_tasks_deadline ON tasks (deadline);
CREATE INDEX idx_bids_task_hours ON bids (task_id, hours ASC, created_at ASC);
CREATE INDEX idx_bids_user ON bids (user_id);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION task_status_rank(s task_status)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'draft' THEN 0
    WHEN 'open' THEN 1
    WHEN 'bidding_closed' THEN 2
    WHEN 'assigned' THEN 3
    WHEN 'in_progress' THEN 4
    WHEN 'review' THEN 5
    WHEN 'done' THEN 6
  END;
$$;

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw TEXT;
BEGIN
  raw := nullif(current_setting('app.user_id', true), '');
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION write_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (entity_type, entity_id, actor_id, action, previous_value, new_value)
    VALUES (TG_TABLE_NAME, NEW.id, current_app_user_id(), 'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (entity_type, entity_id, actor_id, action, previous_value, new_value)
    VALUES (TG_TABLE_NAME, NEW.id, current_app_user_id(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (entity_type, entity_id, actor_id, action, previous_value, new_value)
    VALUES (TG_TABLE_NAME, OLD.id, current_app_user_id(), 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION write_audit();

CREATE TRIGGER audit_tasks
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION write_audit();

CREATE TRIGGER audit_bids
AFTER INSERT OR UPDATE OR DELETE ON bids
FOR EACH ROW EXECUTE FUNCTION write_audit();

CREATE OR REPLACE FUNCTION prevent_task_status_regression()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF task_status_rank(NEW.status) < task_status_rank(OLD.status) THEN
    RAISE EXCEPTION 'TASK_STATUS_REGRESSION: cannot move from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_no_backward_status
BEFORE UPDATE OF status ON tasks
FOR EACH ROW EXECUTE FUNCTION prevent_task_status_regression();

CREATE OR REPLACE FUNCTION enforce_bid_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  t tasks%ROWTYPE;
  u users%ROWTYPE;
BEGIN
  SELECT * INTO t FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF t.status <> 'open' THEN
    RAISE EXCEPTION 'BIDDING_CLOSED: bids are only allowed while the task is open (current status: %)', t.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.user_id = t.created_by THEN
    RAISE EXCEPTION 'OWN_TASK_BID: a user cannot bid on their own task'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO u FROM users WHERE id = NEW.user_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF u.current_workload + NEW.hours > u.max_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: bid of %h would exceed remaining capacity %h',
      NEW.hours, (u.max_capacity - u.current_workload)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bids_enforce_rules
BEFORE INSERT ON bids
FOR EACH ROW EXECUTE FUNCTION enforce_bid_rules();
