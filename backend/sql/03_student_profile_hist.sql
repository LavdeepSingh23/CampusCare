-- =========================================================
-- Table: STUDENT_PROFILE_HISTORY
-- Keeps an audit trail every time a student's profile changes
-- =========================================================
CREATE TABLE STUDENT_PROFILE_HISTORY (
    profile_history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number         VARCHAR(30) NOT NULL,
    full_name           VARCHAR(150) NOT NULL,
    date_of_birth       DATE NOT NULL,
    sex                 ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    phone_number        VARCHAR(20) NULL,
    blood_group         VARCHAR(5) NULL,
    valid_from          DATETIME NOT NULL,
    valid_to            DATETIME NULL,
    changed_by_user_id  BIGINT NOT NULL,
    change_reason       VARCHAR(255) NULL,

    CONSTRAINT fk_sph_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE,
    CONSTRAINT fk_sph_changed_by
        FOREIGN KEY (changed_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
