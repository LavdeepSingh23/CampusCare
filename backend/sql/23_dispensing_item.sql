-- =========================================================
-- Table: DISPENSING_ITEM
-- Line items actually handed to the student, one per medicine
-- =========================================================
CREATE TABLE DISPENSING_ITEM (
    dispensing_item_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    dispensing_id             BIGINT NOT NULL,
    prescription_item_id       BIGINT NULL,
    dispensed_medicine_name     VARCHAR(150) NOT NULL,
    dispensed_strength           VARCHAR(50) NULL,
    dispensed_quantity            DECIMAL(10,2) NULL,
    was_changed                    BOOLEAN NOT NULL DEFAULT FALSE,
    change_reason                   VARCHAR(255) NULL,

    CONSTRAINT fk_di_dispensing
        FOREIGN KEY (dispensing_id) REFERENCES DISPENSING(dispensing_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_di_prescription_item
        FOREIGN KEY (prescription_item_id) REFERENCES PRESCRIPTION_ITEM(prescription_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
