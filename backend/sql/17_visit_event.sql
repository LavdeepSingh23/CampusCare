-- =========================================================
-- Table: VISIT_EVENT
-- Full audit/timeline log of everything that happens on a visit
-- =========================================================
CREATE TABLE VISIT_EVENT (
    event_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    visit_id              BIGINT NOT NULL,
    event_type            ENUM('CHECKED_IN', 'QUEUED_JOINED_PATIENT', 'CALLED', 'NO_SHOW', 'REDIRECTED',
                                'PRESCRIPTION_CREATED', 'CONSULTATION_STARTED', 'CONSULTATION_COMPLETED',
                                'WAITING_FOR_MEDICINE', 'MEDICINE_DISPENSED', 'MEDICINE_NOT_COLLECTED',
                                'COMPLETED') NOT NULL,
    performed_by_user_id  BIGINT NOT NULL,
    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes                  VARCHAR(500) NULL,

    CONSTRAINT fk_ve_visit
        FOREIGN KEY (visit_id) REFERENCES VISIT(visit_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ve_performed_by
        FOREIGN KEY (performed_by_user_id) REFERENCES USER_ACCOUNT(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
