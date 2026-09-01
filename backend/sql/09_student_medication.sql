-- =========================================================
-- Table: STUDENT_MEDICATION
-- Ongoing / past medications a student takes, independent
-- of any single prescription
-- =========================================================
CREATE TABLE STUDENT_MEDICATION (
    student_medication_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number             VARCHAR(30) NOT NULL,
    medicine_name            VARCHAR(150) NOT NULL,
    strength                 VARCHAR(50) NULL,
    dose                     VARCHAR(50) NULL,
    reason                   VARCHAR(255) NULL,
    started_at               DATE NOT NULL,
    ended_at                 DATE NULL,
    recorded_by_user_id      BIGINT NOT NULL,

    CONSTRAINT fk_sm_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE,
    CONSTRAINT fk_sm_recorded_by
        FOREIGN KEY (recorded_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
