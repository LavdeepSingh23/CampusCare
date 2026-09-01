-- =========================================================
-- Table: EMERGENCY_CONTACT
-- =========================================================
CREATE TABLE EMERGENCY_CONTACT (
    emergency_contact_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    roll_number            VARCHAR(30) NOT NULL UNIQUE,
    name                    VARCHAR(150) NOT NULL,
    relationship            VARCHAR(50) NOT NULL,
    phone_number            VARCHAR(20) NOT NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ec_roll_number
        FOREIGN KEY (roll_number) REFERENCES STUDENT(roll_number)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
