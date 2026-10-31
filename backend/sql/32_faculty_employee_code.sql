-- =========================================================
-- Migration 32: Faculty Employee Code & Receptionist Check-in Support
-- CampusCare Health Centre Management Platform
-- =========================================================

-- 1. Ensure employee_id column exists on FACULTY_DIRECTORY
ALTER TABLE FACULTY_DIRECTORY 
ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) NULL UNIQUE AFTER designation;

-- 2. Ensure index exists on FACULTY_DIRECTORY.employee_id
CREATE INDEX IF NOT EXISTS idx_fac_dir_emp_id ON FACULTY_DIRECTORY(employee_id);

-- 3. Ensure index exists on FACULTY.employee_id
CREATE INDEX IF NOT EXISTS idx_faculty_emp_id ON FACULTY(employee_id);

-- 4. Seed and update approved faculty directory with unique employee codes
INSERT INTO FACULTY_DIRECTORY (institutional_email, full_name, department, designation, employee_id, is_active)
VALUES 
  ('navjot.sharma@thapar.edu', 'Dr. Navjot Sharma', 'Computer Science & Engineering', 'Associate Professor', '260111', TRUE),
  ('dr.sharma@thapar.edu', 'Dr. Rajesh Sharma', 'Computer Science & Engineering', 'Professor', '260112', TRUE),
  ('anita.verma@thapar.edu', 'Dr. Anita Verma', 'Biotechnology', 'Associate Professor', '260113', TRUE),
  ('test.prof@thapar.edu', 'Prof. Test Faculty', 'Mechanical Engineering', 'Assistant Professor', '260114', TRUE)
ON DUPLICATE KEY UPDATE 
  full_name = VALUES(full_name),
  department = VALUES(department),
  designation = VALUES(designation),
  employee_id = VALUES(employee_id),
  is_active = TRUE;

-- 5. Sync employee_id back to existing FACULTY profiles where matching by email
UPDATE FACULTY f
JOIN USER_ACCOUNT ua ON ua.user_id = f.user_id
JOIN FACULTY_DIRECTORY fd ON fd.institutional_email = ua.email
SET f.employee_id = fd.employee_id
WHERE f.employee_id IS NULL OR f.employee_id != fd.employee_id;
