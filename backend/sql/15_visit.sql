-- =========================================================
-- Table: VISIT
-- One row per clinic visit made by a student
-- =========================================================
CREATE TABLE VISIT (
    visit_id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number                 VARCHAR(30) NOT NULL,
    doctor_id                   BIGINT NULL,
    status                      ENUM('CHECKED_IN', 'WAITING_FOR_DOCTOR', 'CALLED', 'IN_CONSULTATION',
                                      'WAITING_FOR_MEDICINE', 'COMPLETED', 'CANCELLED','NO_SHOW') NOT NULL DEFAULT 'CHECKED_IN',
    checked_in_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consultation_started_at      DATETIME NULL,
    consultation_completed_at    DATETIME NULL,
    completed_at                 DATETIME NULL,
    cancelled_at                 DATETIME NULL,
    cancel_reason                VARCHAR(255) NULL,
    created_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_visit_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
