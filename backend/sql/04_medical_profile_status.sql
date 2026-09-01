-- =========================================================
-- Table: MEDICAL_PROFILE_STATUS
-- Quick-glance flags so staff know if a student's medical
-- info has been filled in, without opening every sub-table
-- =========================================================
CREATE TABLE MEDICAL_PROFILE_STATUS (
    roll_number         VARCHAR(30) PRIMARY KEY,
    allergy_status      ENUM('NOT_REPORTED', 'NONE_REPORTED', 'HAS_RECORDS') NOT NULL DEFAULT 'NOT_REPORTED',
    condition_status     ENUM('NOT_REPORTED', 'NONE_REPORTED', 'HAS_RECORDS') NOT NULL DEFAULT 'NOT_REPORTED',
    medication_status    ENUM('NOT_REPORTED', 'NONE_REPORTED', 'HAS_RECORDS') NOT NULL DEFAULT 'NOT_REPORTED',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_mps_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
