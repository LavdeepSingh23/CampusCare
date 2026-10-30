-- =========================================================
-- Migration 30: Structured Clinical Case Category for CONSULTATION
-- CampusCare Health Centre Management Platform
-- =========================================================

ALTER TABLE CONSULTATION 
ADD COLUMN case_category VARCHAR(50) NOT NULL DEFAULT 'UNSPECIFIED' 
AFTER diagnosis;

CREATE INDEX idx_consultation_case_category ON CONSULTATION(case_category);
