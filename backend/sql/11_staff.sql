-- =========================================================
-- Table: STAFF
-- One-to-one extension of USER_ACCOUNT for staff members
-- =========================================================
CREATE TABLE STAFF (
    staff_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL UNIQUE,
    role         ENUM('ADMIN', 'DOCTOR', 'RECEPTIONIST') NOT NULL,
    status       ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_staff_user
        FOREIGN KEY (user_id) REFERENCES USER_ACCOUNT(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
