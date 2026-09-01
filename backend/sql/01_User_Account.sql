-- =========================================================
-- Table: USER_ACCOUNT
-- Base login table for every person in the system
-- (students login with roll number mapped here, staff too)
-- =========================================================
CREATE TABLE USER_ACCOUNT (
    user_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NULL,
    google_subject  VARCHAR(255) UNIQUE NULL,
    account_type    ENUM('STUDENT', 'STAFF') NOT NULL,
    status          ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at   DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
