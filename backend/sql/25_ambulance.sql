-- =========================================================
-- Table: AMBULANCE_DISPATCH
-- =========================================================
CREATE TABLE AMBULANCE_DISPATCH (
    ambulance_dispatch_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    emergency_id             BIGINT NOT NULL UNIQUE,
    ambulance_provider         VARCHAR(150) NULL,
    contact_number               VARCHAR(20) NULL,
    vehicle_number                 VARCHAR(30) NULL,
    called_at                       DATETIME NULL,
    arrived_at                       DATETIME NULL,
    departure_at                      DATETIME NULL,
    destination                        VARCHAR(255) NOT NULL,
    status                              ENUM('REQUESTED', 'DISPATCHED', 'ARRIVED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',

    CONSTRAINT fk_ad_emergency
        FOREIGN KEY (emergency_id) REFERENCES EMERGENCY_LOG(emergency_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
