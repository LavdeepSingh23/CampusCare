-- =========================================================
-- Table: DOCTOR
-- =========================================================
CREATE TABLE DOCTOR (
    doctor_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    staff_id          BIGINT NOT NULL UNIQUE,
    specialty_id      BIGINT NOT NULL,
    license_number    VARCHAR(100) NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctor_staff
        FOREIGN KEY (staff_id) REFERENCES STAFF(staff_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_doctor_specialty
        FOREIGN KEY (specialty_id) REFERENCES SPECIALTY(specialty_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
