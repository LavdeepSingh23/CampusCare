-- =========================================================
-- Table: PRESCRIPTION
-- =========================================================
CREATE TABLE PRESCRIPTION (
    prescription_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    consultation_id        BIGINT NOT NULL UNIQUE,
    general_instructions   TEXT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at             DATETIME NULL,

    CONSTRAINT fk_presc_consultation
        FOREIGN KEY (consultation_id) REFERENCES CONSULTATION(consultation_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
