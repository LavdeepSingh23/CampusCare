import { jsPDF } from 'jspdf'

/**
 * CampusCare Formal Black-and-White E-Prescription PDF Generator
 * Renders an authentic, formal, monochrome clinical OPD prescription document
 * matching standardized university and hospital clinical layouts.
 *
 * @param {Object} options
 * @param {Object} options.prescription - Saved prescription object returned from backend
 * @param {Object} options.doctor - Verified doctor profile information
 * @param {Object} options.patient - Verified patient details from visit/queue
 * @param {Array} options.medicines - Array of prescribed medicines (saved or draft)
 * @param {boolean} [options.autoDownload=true] - Whether to automatically trigger browser download
 * @param {boolean} [options.openPrint=false] - Whether to open in new tab for immediate printing
 * @returns {jsPDF} The jsPDF document instance
 */
export function generatePrescriptionPdf({
  prescription,
  doctor,
  patient,
  medicines = [],
  autoDownload = true,
  openPrint = false,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth() // 210mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297mm
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  let y = 18

  // ── CLINIC & DOCTOR HEADER (FORMAL B&W) ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text('CAMPUSCARE HEALTH CENTRE', margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(50, 50, 50)
  y += 4.5
  doc.text('Thapar Institute of Engineering & Technology, Patiala - 147004', margin, y)
  y += 4
  doc.text('Ph: +91 175-2393000 | Email: healthcentre@thapar.edu | Closed: Sunday', margin, y)

  // Doctor Name & Qualifications
  y += 5.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(0, 0, 0)
  const doctorName = doctor?.name ? (doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`) : 'Dr. Neha Kapoor'
  doc.text(doctorName, margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(40, 40, 40)
  y += 4.2
  const regNo = doctor?.regNo || doctor?.licenseNumber || doctor?.license_number || 'TIET-DOC-0104'
  const spec = doctor?.specialization || doctor?.specialty || 'General Physician'
  const room = doctor?.room ? ` | Room: ${doctor.room}` : ' | Room: 104'
  doc.text(`M.B.B.S, MD (${spec}) | Reg. No: ${regNo}${room}`, margin, y)

  // Solid Black Divider Line
  y += 4
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageWidth - margin, y)

  // ── PATIENT IDENTIFICATION & DATE (B&W) ──
  y += 6

  // Date (Right Aligned)
  const rawDate = prescription?.finalized_at || prescription?.finalizedAt || new Date().toISOString()
  const dateFormatted = new Date(rawDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(`Date: ${dateFormatted}`, pageWidth - margin, y, { align: 'right' })

  // Patient Name
  const patientName = patient?.name || patient?.student_name || 'Student Patient'
  const gender = patient?.gender || 'Student'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text(`Patient Name: ${patientName} (${gender})`, margin, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(40, 40, 40)
  const rollNo = patient?.rollNo || patient?.rollNumber || patient?.roll_number || '1024030107'
  const age = patient?.age || 21
  const blood = patient?.bloodGroup || patient?.blood_group || 'B+'
  doc.text(`Roll No: ${rollNo}  |  Age: ${age} Y  |  Blood: ${blood}`, margin, y)

  y += 4.5
  doc.text(`Address: TIET Campus Hostels, Patiala - 147004`, margin, y)

  // Subtle separator line
  y += 4
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.2)
  doc.line(margin, y, pageWidth - margin, y)

  // ── CLINICAL ASSESSMENT (CHIEF COMPLAINTS & DIAGNOSIS) ──
  y += 6
  const complaint = (patient?.complaint || prescription?.reason_for_visit || 'Eye Irritation').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text('Chief Complaints:', margin, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`- ${complaint}`, margin + 2, y)

  y += 6
  const diagnosis = (prescription?.diagnosis || 'Acute Tonsillitis / Viral Infection').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Diagnosis:', margin, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`- ${diagnosis}`, margin + 2, y)

  const clinicalNotes = prescription?.clinical_notes || prescription?.clinicalNotes || 'Vitals stable; physical parameters evaluated.'
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Clinical Observations / Notes:', margin, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`- ${clinicalNotes.toUpperCase()}`, margin + 2, y)

  // ── Rx SYMBOL & MEDICINES TABLE (FORMAL B&W) ──
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text('R', margin, y)

  y += 2
  // Table Top Rule
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  // Table Column Headers
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(0, 0, 0)
  doc.text('Medicine Name', margin + 2, y)
  doc.text('Dosage', margin + 95, y)
  doc.text('Duration', margin + 145, y)
  doc.text('Qty', pageWidth - margin - 2, y, { align: 'right' })

  y += 2.5
  // Header Bottom Rule
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)

  // Medicine Rows
  const medList =
    (prescription?.medicines && prescription.medicines.length > 0)
      ? prescription.medicines
      : (medicines && medicines.length > 0)
      ? medicines
      : [
          {
            name: 'Paracetamol 650mg',
            dosage: '1-0-1',
            duration: '3 Days',
            instruction: 'After Food',
            qty: 6,
          },
        ]

  y += 5
  medList.forEach((med, idx) => {
    const medName = (med.name || med.medicine_name || 'Medicine').toUpperCase()
    const dosage = med.dosage || med.timing || '1-0-1'
    const duration = med.duration || '3 Days'
    const instruction = med.instruction || 'After Food'
    const qty = med.qty || 1

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    doc.text(`${idx + 1}. ${medName}`, margin + 2, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(dosage, margin + 95, y)
    doc.text(duration, margin + 145, y)
    doc.setFont('helvetica', 'bold')
    doc.text(String(qty), pageWidth - margin - 2, y, { align: 'right' })

    // Instruction Sub-row
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.text(`(${instruction})`, margin + 6, y)

    y += 5
  })

  // Table Bottom Rule
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  // ── ADVICE GIVEN (FORMAL B&W) ──
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text('Advice Given:', margin, y)

  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(20, 20, 20)
  const advice = prescription?.dietAdvice || prescription?.diet_advice || 'Adequate hydration, warm saline gargles thrice daily, avoid cold beverages.'
  const adviceParts = advice.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
  if (adviceParts.length > 0) {
    adviceParts.forEach((part) => {
      doc.text(`- ${part.toUpperCase()}`, margin + 2, y)
      y += 4
    })
  } else {
    doc.text(`- ${advice.toUpperCase()}`, margin + 2, y)
    y += 4
  }

  // ── FOLLOW UP ──
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const followUp = prescription?.followUp || prescription?.follow_up || 'In 3 Days'
  doc.text(`Follow Up: ${followUp}`, margin, y)

  // ── DOCTOR SIGNATURE (BOTTOM RIGHT) ──
  const signY = pageHeight - 32
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(doctorName, pageWidth - margin, signY, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(40, 40, 40)
  doc.text(`M.B.B.S, MD, Reg. No: ${regNo}`, pageWidth - margin, signY + 4, { align: 'right' })
  doc.text('Medical Officer, TIET Health Centre', pageWidth - margin, signY + 8, { align: 'right' })

  // Page Footer (Bottom Left)
  doc.setLineWidth(0.2)
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 100, 100)
  doc.text('Page 1 of 1', margin, pageHeight - 11)
  doc.text('Official Clinical Record - CampusCare Health Centre', pageWidth - margin, pageHeight - 11, { align: 'right' })

  // Actions
  if (openPrint) {
    doc.autoPrint()
    const pdfUrl = doc.output('bloburl')
    window.open(pdfUrl, '_blank')
  } else if (autoDownload) {
    const filename = `Prescription_${patientName.replace(/\s+/g, '_')}_${rollNo}.pdf`
    doc.save(filename)
  }

  return doc
}

export default generatePrescriptionPdf
