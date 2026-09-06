-- =========================================================
-- Table: DOCTOR_AVAILABILITY
-- =========================================================
CREATE TABLE DOCTOR_AVAILABILITY (
    availability_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    doctor_id            BIGINT NOT NULL,
    availability_date    DATE NOT NULL,
    status               ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL,
    start_time           TIME NULL,
    end_time             TIME NULL,
    created_by_user_id   BIGINT NOT NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (doctor_id, availability_date),
    CONSTRAINT fk_da_doctor
        FOREIGN KEY (doctor_id) REFERENCES DOCTOR(doctor_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_da_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
