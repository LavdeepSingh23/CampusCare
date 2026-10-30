-- =========================================================
-- Migration 31: Daily Analytics Report Dispatch and Execution Log
-- CampusCare Health Centre Management Platform
-- =========================================================

CREATE TABLE IF NOT EXISTS DAILY_ANALYTICS_REPORT_LOG (
    report_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reporting_date DATE NOT NULL UNIQUE,
    recipient_email VARCHAR(255) NOT NULL,
    status ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    resend_email_id VARCHAR(100) NULL,
    pdf_file_path VARCHAR(500) NULL,
    pdf_size_bytes INT NULL,
    total_visits INT DEFAULT 0,
    total_consultations INT DEFAULT 0,
    total_prescriptions INT DEFAULT 0,
    total_emergencies INT DEFAULT 0,
    error_message TEXT NULL,
    attempt_count INT DEFAULT 1,
    generated_at DATETIME NOT NULL,
    sent_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_report_date (reporting_date),
    INDEX idx_report_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
