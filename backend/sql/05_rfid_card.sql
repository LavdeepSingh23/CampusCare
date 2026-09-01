-- =========================================================
-- Table: RFID_CARD
-- Physical ID cards issued to students for check-in
-- =========================================================
CREATE TABLE RFID_CARD (
    rfid_card_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number     VARCHAR(30) NOT NULL,
    card_uid        VARCHAR(100) NOT NULL UNIQUE,
    status          ENUM('ACTIVE', 'LOST', 'REPLACED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at  DATETIME NULL,

    CONSTRAINT fk_rfid_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
