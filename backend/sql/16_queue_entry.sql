-- =========================================================
-- Table: QUEUE_ENTRY
-- Tracks a visit's position in a specific doctor's queue
-- (a visit can appear more than once if redirected)
-- =========================================================
CREATE TABLE QUEUE_ENTRY (
    queue_entry_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    visit_id         BIGINT NOT NULL,
    doctor_id        BIGINT NOT NULL UNIQUE,
    queue_sequence   INT NOT NULL UNIQUE,
    status           ENUM('IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'REDIRECTED','WAITING') NOT NULL,
    entered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queue_data       DATETIME NOT NULL UNIQUE,
    called_at        DATETIME NULL,
    exited_at        DATETIME NULL,
    entry_reason     ENUM('INITIAL_CHECKIN', 'DOCTOR_REDIRECT', 'NO_SHOW_RESCHEDULE') NOT NULL,
    exit_reason      ENUM('CALLED', 'REDIRECTED', 'NO_SHOW', 'CANCELLED', 'COMPLETED') NULL,

    CONSTRAINT fk_qe_visit
        FOREIGN KEY (visit_id) REFERENCES VISIT(visit_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_qe_doctor
        FOREIGN KEY (doctor_id) REFERENCES DOCTOR(doctor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
