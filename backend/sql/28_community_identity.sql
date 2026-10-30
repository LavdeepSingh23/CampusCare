-- =========================================================
-- Migration 28: Community Member Identity & Unified Patient Model
-- Adds PATIENT, COMMUNITY_SEQUENCE, COMMUNITY_PROFILE, MANUAL_VERIFICATION
-- Updates VISIT to link to PATIENT and makes roll_number nullable
-- =========================================================

-- 1. Create Base PATIENT Table
CREATE TABLE IF NOT EXISTS PATIENT (
    patient_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    patient_type ENUM('STUDENT', 'COMMUNITY') NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    date_of_birth DATE NULL,
    age INT NULL,
    gender ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    blood_group VARCHAR(10) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patient_type (patient_type),
    INDEX idx_patient_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Add patient_id to STUDENT table to link 1:1 with PATIENT
ALTER TABLE STUDENT
    ADD COLUMN IF NOT EXISTS patient_id BIGINT NULL UNIQUE;

-- 3. Dedicated Sequence Table for Concurrency-Safe Community Codes (CC-COM-1001, CC-COM-1002, ...)
CREATE TABLE IF NOT EXISTS COMMUNITY_SEQUENCE (
    seq_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4;

-- 4. Create COMMUNITY_PROFILE Table
CREATE TABLE IF NOT EXISTS COMMUNITY_PROFILE (
    community_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT NOT NULL UNIQUE,
    community_code VARCHAR(30) NOT NULL UNIQUE,
    category ENUM('CARETAKER', 'CAMPUS_WORKER', 'GUARD', 'OTHER') NOT NULL,
    category_other VARCHAR(150) NULL,
    affiliation_details VARCHAR(255) NOT NULL,
    registered_by_staff_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_comm_patient
        FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_comm_staff
        FOREIGN KEY (registered_by_staff_id) REFERENCES STAFF(staff_id)
        ON DELETE SET NULL,
    INDEX idx_comm_category (category),
    INDEX idx_comm_code (community_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Create MANUAL_VERIFICATION Table
CREATE TABLE IF NOT EXISTS MANUAL_VERIFICATION (
    verification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    receptionist_user_id BIGINT NOT NULL,
    verification_outcome ENUM('VERIFIED', 'REJECTED', 'FLAGGED') NOT NULL,
    notes TEXT NULL,
    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_verif_patient
        FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_verif_receptionist
        FOREIGN KEY (receptionist_user_id) REFERENCES USER_ACCOUNT(user_id)
        ON DELETE RESTRICT,
    INDEX idx_verif_patient (patient_id),
    INDEX idx_verif_outcome (verification_outcome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Modify VISIT table: add patient_id and make roll_number nullable
ALTER TABLE VISIT
    ADD COLUMN IF NOT EXISTS patient_id BIGINT NULL AFTER visit_id;

ALTER TABLE VISIT
    MODIFY COLUMN roll_number VARCHAR(30) NULL;

