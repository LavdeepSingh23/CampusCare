-- =========================================================
-- Table: EMERGENCY_LOG
-- =========================================================
CREATE TABLE EMERGENCY_LOG (
    emergency_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number             VARCHAR(30) NOT NULL,
    recorded_by_user_id      BIGINT NOT NULL,
    occurred_at               DATETIME NOT NULL,
    emergency_type             VARCHAR(100) NOT NULL,
    description                 TEXT NOT NULL,
    severity                     ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    action_taken                  TEXT NOT NULL,
    ambulance_required             BOOLEAN NOT NULL DEFAULT FALSE,
    called_at                       DATETIME NULL,
    created_at                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_el_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number),
    CONSTRAINT fk_el_recorded_by
        FOREIGN KEY (recorded_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
