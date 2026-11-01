-- =========================================================
-- Migration 33: Transactional Outbox Pattern for Queue Events
-- CampusCare Health Centre Management Platform
-- =========================================================

CREATE TABLE IF NOT EXISTS OUTBOX_EVENT (
    event_id VARCHAR(36) NOT NULL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    channel VARCHAR(128) NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL DEFAULT 'QUEUE',
    aggregate_id VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    status ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    last_error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    published_at TIMESTAMP NULL,
    INDEX idx_outbox_status_created (status, created_at),
    INDEX idx_outbox_aggregate (aggregate_type, aggregate_id),
    INDEX idx_outbox_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

