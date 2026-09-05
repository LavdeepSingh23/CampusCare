-- =========================================================
-- Fix: QUEUE_ENTRY incorrectly has UNIQUE on doctor_id,
-- queue_sequence, and queue_data. A doctor's queue must hold
-- multiple patients, so these should NOT be unique.
-- =========================================================
ALTER TABLE QUEUE_ENTRY DROP INDEX doctor_id;
ALTER TABLE QUEUE_ENTRY DROP INDEX queue_sequence;
ALTER TABLE QUEUE_ENTRY DROP INDEX queue_data;
