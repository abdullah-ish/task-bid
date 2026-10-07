-- Demo data for reviewers. Safe to re-run after a fresh migrate.
-- Bids are inserted while tasks are still `open` (DB trigger), then
-- race/stale scenarios are advanced to `bidding_closed`.

TRUNCATE audit_log, bids, tasks, users RESTART IDENTITY CASCADE;

INSERT INTO users (id, name, email, hourly_rate, max_capacity, current_workload) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Amina Shah', 'amina@taskbid.dev', 85, 40, 32),
  ('22222222-2222-2222-2222-222222222222', 'Bilal Khan', 'bilal@taskbid.dev', 70, 30, 10),
  ('33333333-3333-3333-3333-333333333333', 'Chen Wei', 'chen@taskbid.dev', 90, 20, 10),
  ('44444444-4444-4444-4444-444444444444', 'Diego Alves', 'diego@taskbid.dev', 65, 40, 0),
  ('55555555-5555-5555-5555-555555555555', 'Elena Rossi', 'elena@taskbid.dev', 75, 25, 25);

-- Remaining capacity after seed:
-- Amina  8h   (5h + 7h race bids cannot both be accepted)
-- Bilal 20h
-- Chen   2h   (stale 3h bid must be skipped)
-- Diego 40h
-- Elena  0h   (cannot place new bids)

INSERT INTO tasks (id, title, description, complexity, status, created_by, assigned_to, assigned_hours, deadline, created_at) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Draft: rewrite onboarding copy',
    'Internal draft. Not yet open for bids.',
    2, 'draft',
    '11111111-1111-1111-1111-111111111111', NULL, NULL,
    now() + interval '10 days', now() - interval '2 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Open: add CSV export to reports',
    'Export dashboard stats as CSV. Open for bidding.',
    3, 'open',
    '11111111-1111-1111-1111-111111111111', NULL, NULL,
    now() + interval '5 days', now() - interval '1 day'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Race A: capacity collision task X',
    'Lowest bid is Amina at 5h. Pair with task Y and fire two /assign calls.',
    4, 'open',
    '44444444-4444-4444-4444-444444444444', NULL, NULL,
    now() + interval '3 days', now() - interval '4 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'Race B: capacity collision task Y',
    'Lowest bid is Amina at 7h. Together with X this exceeds her remaining 8h.',
    4, 'open',
    '44444444-4444-4444-4444-444444444444', NULL, NULL,
    now() + interval '3 days', now() - interval '4 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'Stale bid: Chen no longer has capacity',
    'Chen bid 3h while having more room; remaining capacity is now 2h. Assign should skip Chen.',
    2, 'open',
    '11111111-1111-1111-1111-111111111111', NULL, NULL,
    now() + interval '2 days', now() - interval '3 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    'In progress: webhook retry worker',
    'Assigned and underway.',
    3, 'in_progress',
    '22222222-2222-2222-2222-222222222222',
    '44444444-4444-4444-4444-444444444444', 8,
    now() + interval '6 days', now() - interval '8 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
    'Review: dark mode tokens',
    'Waiting on review.',
    1, 'review',
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222', 4,
    now() + interval '1 day', now() - interval '12 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
    'Done: fix timezone on deadlines',
    'Completed by Diego.',
    2, 'done',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444', 3,
    now() - interval '2 days', now() - interval '20 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9',
    'Done: password reset emails',
    'Completed by Bilal.',
    3, 'done',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222', 6,
    now() - interval '5 days', now() - interval '25 days'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10',
    'Overdue with zero bids',
    'Past deadline, never received a bid. Should appear on the dashboard.',
    5, 'open',
    '55555555-5555-5555-5555-555555555555', NULL, NULL,
    now() - interval '2 days', now() - interval '10 days'
  );

INSERT INTO bids (task_id, user_id, hours, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222', 12, now() - interval '20 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '44444444-4444-4444-4444-444444444444', 9, now() - interval '18 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', 5, now() - interval '2 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222', 9, now() - interval '1 day'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '11111111-1111-1111-1111-111111111111', 7, now() - interval '2 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '22222222-2222-2222-2222-222222222222', 11, now() - interval '1 day'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '33333333-3333-3333-3333-333333333333', 3, now() - interval '5 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '44444444-4444-4444-4444-444444444444', 5, now() - interval '4 days');

UPDATE tasks SET status = 'bidding_closed'
WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'
);

-- Chen's remaining capacity drops after bidding (stale-bid scenario).
UPDATE users
SET current_workload = 18
WHERE id = '33333333-3333-3333-3333-333333333333';
