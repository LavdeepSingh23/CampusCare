CREATE TABLE STUDENT_CONDITION (
    student_condition_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number           VARCHAR(30) NOT NULL,
    condition_id          BIGINT NOT NULL,
    other_description     VARCHAR(255) NULL,
    recorded_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at              DATETIME NULL,
    recorded_by_user_id   BIGINT NOT NULL,
    CONSTRAINT fk_sc_roll_number FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number) ON DELETE CASCADE,
    CONSTRAINT fk_sc_condition FOREIGN KEY (condition_id) REFERENCES `CONDITION`(condition_id),
    CONSTRAINT fk_sc_recorded_by FOREIGN KEY (recorded_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;