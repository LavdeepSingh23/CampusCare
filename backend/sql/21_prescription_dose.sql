-- =========================================================
-- Table: PRESCRIPTION_DOSE
-- Breaks a prescription item into morning/afternoon/evening/night doses
-- =========================================================

CREATE TABLE PRESCRIPTION_DOSE (
    dose_id BIGINT AUTO_INCREMENT PRIMARY KEY,

    prescription_item_id BIGINT NOT NULL,

    time_of_day ENUM(
        'MORNING',
        'AFTERNOON',
        'EVENING',
        'NIGHT'
    ) NOT NULL,

    dose_quantity DECIMAL(4,2) NOT NULL,

    dose_unit VARCHAR(30) NOT NULL,

    CONSTRAINT fk_pd_prescription_item
        FOREIGN KEY (prescription_item_id)
        REFERENCES PRESCRIPTION_ITEM(prescription_item_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_pd_item_time
        UNIQUE (prescription_item_id, time_of_day)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;