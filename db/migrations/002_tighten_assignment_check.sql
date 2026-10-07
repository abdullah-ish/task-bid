ALTER TABLE tasks
  DROP CONSTRAINT assigned_requires_assignee,
  ADD CONSTRAINT assigned_requires_assignee CHECK (
    (
      status IN ('assigned', 'in_progress', 'review', 'done')
      AND assigned_to IS NOT NULL
      AND assigned_hours IS NOT NULL
    )
    OR (
      status IN ('draft', 'open', 'bidding_closed')
      AND assigned_to IS NULL
      AND assigned_hours IS NULL
    )
  );
