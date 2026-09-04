-- =========================================================
-- Table: ALLERGY
-- =========================================================
CREATE TABLE ALLERGY (
    allergy_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number         VARCHAR(30) NOT NULL,
    allergen            VARCHAR(150) NOT NULL,
    reaction             VARCHAR(255) NOT NULL,
    severity            ENUM('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    recorded_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            DATETIME NULL,
    recorded_by_user_id BIGINT NOT NULL,

    CONSTRAINT fk_allergy_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE,
    CONSTRAINT fk_allergy_recorded_by
        FOREIGN KEY (recorded_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
