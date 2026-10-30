-- =========================================================
-- Migration 29: Four-Portal Authentication & Faculty Identity System
-- =========================================================

-- 1. Extend USER_ACCOUNT.account_type to support 'FACULTY'
ALTER TABLE USER_ACCOUNT 
  MODIFY COLUMN account_type ENUM('STUDENT', 'STAFF', 'FACULTY') NOT NULL;

-- 2. Extend PATIENT.patient_type to support 'FACULTY' and 'FACULTY_DEPENDENT'
ALTER TABLE PATIENT 
  MODIFY COLUMN patient_type ENUM('STUDENT', 'COMMUNITY', 'FACULTY', 'FACULTY_DEPENDENT') NOT NULL;

-- 3. Create Approved Faculty Email Directory (Admin Managed Authority)
CREATE TABLE IF NOT EXISTS FACULTY_DIRECTORY (
    faculty_dir_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    institutional_email VARCHAR(255) NOT NULL UNIQUE,
    full_name           VARCHAR(150) NOT NULL,
    department          VARCHAR(100) NOT NULL,
    designation         VARCHAR(100) NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    account_created     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fac_dir_email (institutional_email),
    INDEX idx_fac_dir_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Create FACULTY Profile Table
CREATE TABLE IF NOT EXISTS FACULTY (
    faculty_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT NOT NULL UNIQUE,
    patient_id          BIGINT NOT NULL UNIQUE,
    employee_id         VARCHAR(50) NULL UNIQUE,
    department          VARCHAR(100) NOT NULL,
    designation         VARCHAR(100) NULL,
    status              ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_faculty_user FOREIGN KEY (user_id) REFERENCES USER_ACCOUNT(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_faculty_patient FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Create FACULTY_FAMILY_MEMBER Relationship Table
CREATE TABLE IF NOT EXISTS FACULTY_FAMILY_MEMBER (
    family_member_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    faculty_id          BIGINT NOT NULL,
    patient_id          BIGINT NOT NULL UNIQUE,
    relationship_type   ENUM('SPOUSE', 'CHILD', 'PARENT', 'OTHER') NOT NULL,
    relationship_status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fam_faculty FOREIGN KEY (faculty_id) REFERENCES FACULTY(faculty_id) ON DELETE CASCADE,
    CONSTRAINT fk_fam_patient FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id) ON DELETE RESTRICT,
    INDEX idx_fam_fac (faculty_id, relationship_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Seed Initial Faculty Directory Records for Verification
INSERT INTO FACULTY_DIRECTORY (institutional_email, full_name, department, designation, is_active)
VALUES 
  ('dr.sharma@thapar.edu', 'Dr. Rajesh Sharma', 'Computer Science & Engineering', 'Professor', TRUE),
  ('anita.verma@thapar.edu', 'Dr. Anita Verma', 'Biotechnology', 'Associate Professor', TRUE)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

