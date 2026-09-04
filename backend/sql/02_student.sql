-- =========================================================
-- Table: STUDENT
-- One-to-one extension of USER_ACCOUNT for students
-- =========================================================
CREATE TABLE STUDENT (
    roll_number     VARCHAR(30) PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE,
    full_name       VARCHAR(150) NOT NULL,
    date_of_birth   DATE NOT NULL,
    sex             ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    phone_number    VARCHAR(20) NULL,
    blood_group     VARCHAR(5) NULL,
    status          ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_student_user
        FOREIGN KEY (user_id) REFERENCES USER_ACCOUNT(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
