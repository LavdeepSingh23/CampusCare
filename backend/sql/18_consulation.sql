-- =========================================================
-- Table: CONSULTATION
-- =========================================================
CREATE TABLE CONSULTATION (
    consultation_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    visit_id          BIGINT NOT NULL UNIQUE,
    doctor_id         BIGINT NOT NULL,
    reason_for_visit  TEXT NOT NULL,
    diagnosis         TEXT NOT NULL,
    clinical_notes    TEXT NULL,

    CONSTRAINT fk_consult_visit
        FOREIGN KEY (visit_id) REFERENCES VISIT(visit_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_consult_doctor
        FOREIGN KEY (doctor_id) REFERENCES DOCTOR(doctor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
