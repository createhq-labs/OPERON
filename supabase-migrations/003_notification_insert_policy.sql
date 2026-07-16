-- ============================================================
-- Migration 003: Expand notification INSERT policy
--
-- The original "hr tier insert" policy allowed only HR / Admin / Co-Founder
-- to create notifications. Leave workflow actions (TL approval, employee
-- self-confirmation, rejection) are now initiated by multiple role tiers,
-- so the INSERT restriction is relaxed to any authenticated user.
--
-- Read access remains tightly scoped by the SELECT policy — users can only
-- see notifications addressed to them. Widening INSERT does not expose any
-- data; it only allows workflow actors to enqueue notifications for others.
-- ============================================================

drop policy if exists "hr tier insert notifications" on notifications;

create policy "authenticated insert notifications" on notifications
  for insert with check (auth.role() = 'authenticated');
