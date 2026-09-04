-- =========================================================
-- Table: PRESCRIPTION_ITEM
-- One row per medicine within a prescription
-- =========================================================
CREATE TABLE PRESCRIPTION_ITEM (
    prescription_item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    prescription_id        BIGINT NOT NULL,
    medicine_name           VARCHAR(150) NOT NULL,
    strength                 VARCHAR(50) NULL,
    dosage_form              VARCHAR(50) NULL,
    route                    VARCHAR(50) NULL,
    duration_value            INT NULL,
    duration_unit             ENUM('DAY', 'WEEK', 'MONTH') NULL,
    meal_relation             ENUM('BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL', 'ANY_TIME', 'NOT_APPLICABLE') NULL,
    special_instructions      TEXT NULL,
    created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pi_prescription
        FOREIGN KEY (prescription_id) REFERENCES PRESCRIPTION(prescription_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
