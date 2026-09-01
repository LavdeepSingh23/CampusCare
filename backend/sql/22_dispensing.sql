-- =========================================================
-- Table: DISPENSING
-- Record of medicine handed over to the student for a visit
-- NOTE: original spec had a malformed "status" type; using a
-- sensible ENUM here -- adjust values if you had something
-- else in mind.
-- =========================================================
CREATE TABLE DISPENSING (
    dispensing_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    visit_id                BIGINT NOT NULL UNIQUE,
    dispensed_by_staff_id    BIGINT NOT NULL,
    status                   ENUM('PENDING', 'DISPENSED', 'PARTIALLY_DISPENSED', 'NOT_COLLECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    was_changed                 BOOLEAN NOT NULL DEFAULT FALSE,
    change_reason                VARCHAR(255) NULL,

    CONSTRAINT fk_disp_visit
        FOREIGN KEY (visit_id) REFERENCES VISIT(visit_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_disp_staff
        FOREIGN KEY (dispensed_by_staff_id) REFERENCES STAFF(staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
