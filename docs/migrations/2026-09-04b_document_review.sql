-- 2026-09-04b · who reviewed a document, and when
--
-- Idempotent. Safe to re-run.
--
-- ⚑ WHY SO SMALL. The review screen writes three fields that already exist —
-- `status`, `review_note`, `expires_at`. All this adds is the provenance the
-- founder asked for: a dispute six months from now needs to know who approved
-- the licence and on what day.
--
-- ⚑ AND WHY THERE IS NO NEW RLS POLICY, WHICH IS THE PART WORTH READING.
-- `document` has exactly one policy — `p_document_owner`, SELECT only — so every
-- write is already denied to a browser session, and the Driver's own upload path
-- works by authorising with the user session and then writing with the SERVICE
-- ROLE (lib/document-actions.ts:50,140). The review action does the same.
--
-- Adding `create policy … for update to authenticated using (app_role()='admin')`
-- would have been the obvious move and it would have made things WORSE: it would
-- let anyone holding an admin session PATCH `document` straight through PostgREST,
-- with no server-side check that a rejection carries a note. Keeping the write
-- server-only means the rule "you cannot reject without saying why" is enforced in
-- one place that cannot be bypassed. Do not "fix" this by adding a policy.

begin;

alter table document add column if not exists reviewed_at timestamptz;
alter table document add column if not exists reviewed_by uuid;

comment on column document.reviewed_at is
  'When a human last set this row''s status to verified or rejected. NULL while '
  'the document is still pending, and NULL on every row uploaded before '
  '2026-09-04. Not touched by the Driver re-uploading.';

comment on column document.reviewed_by is
  'auth.uid() of the reviewer. ⚑ Deliberately NOT a foreign key to auth.users: '
  '`document.owner_id` is FK-less for the same reason (it is polymorphic), and a '
  'reviewer''s account being deleted must never cascade away the audit trail of '
  'what they approved.';

commit;

-- ⚑ AFTER RUNNING THIS, from the repo root:
--     npx tsx .local/probe/document-review.mts      -- expect all green
