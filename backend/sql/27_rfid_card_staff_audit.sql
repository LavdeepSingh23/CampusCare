-- =========================================================
-- Table: RFID_CARD staff audit columns
-- Records the staff user who issued or revoked the RFID card
-- =========================================================
ALTER TABLE RFID_CARD
    ADD COLUMN IF NOT EXISTS issued_by_user_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS revoked_by_user_id BIGINT NULL;

