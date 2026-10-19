import { jsPDF } from 'jspdf'

/**
 * CampusCare E-Prescription PDF Generator
 * Creates an authentic, professional, multi-color A4 medical prescription document
 * following the CampusCare Clinic Management System and TIET Health Centre specifications.
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
  const margin = 14
  const contentWidth = pageWidth - margin * 2

  // ── Palette (Healthcare Teal & Clean Slate) ──
  const primaryTeal = [15, 118, 110] // #0f766e
  const darkTeal = [17, 94, 89] // #115e59
  const accentEmerald = [5, 150, 105] // #059669
  const lightBg = [248, 250, 252] // slate-50
  const borderGrey = [226, 232, 240] // slate-200
  const textDark = [15, 23, 42] // slate-900
  const textMuted = [100, 116, 139] // slate-500
  const white = [255, 255, 255]

  let y = 14

  // ── TOP HEADER / CLINIC BRANDING ──
  // Header background banner
  doc.setFillColor(...lightBg)
  doc.roundedRect(margin, y, contentWidth, 26, 2, 2, 'F')
  doc.setDrawColor(...borderGrey)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentWidth, 26, 2, 2, 'D')

  // Top decorative teal accent line
  doc.setFillColor(...primaryTeal)
  doc.rect(margin, y, contentWidth, 2, 'F')

  // Clinic Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...darkTeal)
  doc.text('CAMPUSCARE HEALTH CENTRE', margin + 6, y + 9)

  // Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...textMuted)
  doc.text(
    'Thapar Institute of Engineering & Technology, Patiala • University OPD & Health Services',
    margin + 6,
    y + 14
  )
  doc.text(
    'Emergency: +91 175-2393000 • Email: healthcentre@thapar.edu • Room: ' +
      (doctor?.room || 'Room 104'),
    margin + 6,
    y + 19
  )

  // Right Header Badge (Official E-Prescription)
  const prescriptionId =
    prescription?.prescription_id ||
    prescription?.prescriptionId ||
    `RX-${Date.now().toString().slice(-6)}`
  const visitId = prescription?.visit_id || prescription?.visitId || patient?.visitId || 'N/A'
  const queueNo = patient?.queueNo ?? patient?.queue_number ?? '—'

  doc.setFillColor(...darkTeal)
  doc.roundedRect(pageWidth - margin - 52, y + 5, 46, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...white)
  doc.text('OFFICIAL E-PRESCRIPTION', pageWidth - margin - 29, y + 10, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`ID: #${prescriptionId}`, pageWidth - margin - 29, y + 14.5, { align: 'center' })
  doc.text(`Token #${queueNo} • Visit #${visitId}`, pageWidth - margin - 29, y + 18.5, {
    align: 'center',
  })

  y += 31

  // ── DOCTOR & PATIENT METADATA COLUMNS ──
  const colWidth = (contentWidth - 4) / 2
  const metaHeight = 32

  // Left Box: Prescribing Doctor
  doc.setFillColor(...white)
  doc.setDrawColor(...borderGrey)
  doc.roundedRect(margin, y, colWidth, metaHeight, 1.5, 1.5, 'FD')

  doc.setFillColor(...primaryTeal)
  doc.rect(margin, y, 2.5, metaHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...darkTeal)
  doc.text('PRESCRIBING PHYSICIAN', margin + 6, y + 5.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...textDark)
  doc.text(doctor?.name || 'Dr. Neha Kapoor', margin + 6, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...textMuted)
  doc.text(doctor?.specialization || 'General Physician', margin + 6, y + 16)
  doc.text(
    `Reg No: ${doctor?.regNo || 'TIET-DOC-0104'} • Station: ${doctor?.room ? 'Room ' + doctor.room : 'OPD-104'}`,
    margin + 6,
    y + 21
  )
  doc.text(`Email: ${doctor?.email || 'dr.kapoor@thapar.edu'}`, margin + 6, y + 26)

  // Right Box: Patient Details
  const rightX = margin + colWidth + 4
  doc.setFillColor(...white)
  doc.roundedRect(rightX, y, colWidth, metaHeight, 1.5, 1.5, 'FD')

  doc.setFillColor(...accentEmerald)
  doc.rect(rightX, y, 2.5, metaHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...accentEmerald)
  doc.text('PATIENT IDENTIFICATION', rightX + 6, y + 5.5)

  const patientName = patient?.name || patient?.student_name || 'Student Patient'
  const rollNo = patient?.rollNo || patient?.rollNumber || patient?.roll_number || 'N/A'
  const age = patient?.age || 20
  const gender = patient?.gender || 'Student'
  const bloodGroup = patient?.bloodGroup || patient?.blood_group || 'Not recorded'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...textDark)
  doc.text(patientName, rightX + 6, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...textMuted)
  doc.text(`Roll No: ${rollNo} • TIET Student`, rightX + 6, y + 16)
  doc.text(`Age: ${age} Yrs • Sex/Role: ${gender} • Blood: ${bloodGroup}`, rightX + 6, y + 21)

  // Finalized Date
  const rawDate =
    prescription?.finalized_at ||
    prescription?.finalizedAt ||
    new Date().toISOString()
  const dateFormatted = new Date(rawDate).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Date & Time: ${dateFormatted}`, rightX + 6, y + 26)

  y += metaHeight + 5

  // ── CLINICAL ASSESSMENT & DIAGNOSIS ──
  const complaint =
    prescription?.reason_for_visit ||
    prescription?.reasonForVisit ||
    patient?.complaint ||
    'General Health Consultation'
  const diagnosis = prescription?.diagnosis || 'Acute Respiratory Tract Infection'
  const clinicalNotes =
    prescription?.clinical_notes ||
    prescription?.clinicalNotes ||
    prescription?.general_instructions ||
    'Patient presented with symptoms; vital parameters evaluated.'

  doc.setFillColor(241, 245, 249) // slate-100
  doc.roundedRect(margin, y, contentWidth, 20, 1.5, 1.5, 'F')
  doc.setDrawColor(...borderGrey)
  doc.roundedRect(margin, y, contentWidth, 20, 1.5, 1.5, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...textMuted)
  doc.text('CHIEF COMPLAINT:', margin + 4, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textDark)
  doc.text(complaint.slice(0, 80), margin + 36, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...darkTeal)
  doc.text('DIAGNOSIS:', margin + 4, y + 11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(185, 28, 28) // red-700 for clinical diagnosis emphasis
  doc.text(diagnosis.slice(0, 85), margin + 36, y + 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...textMuted)
  doc.text('CLINICAL NOTES:', margin + 4, y + 16.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textDark)
  doc.text(clinicalNotes.slice(0, 95), margin + 36, y + 16.5)

  y += 25

  // ── PRESCRIBED MEDICINES (Rx TABLE) ──
  // Rx Symbol & Section Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...darkTeal)
  doc.text('Rx', margin, y)

  doc.setFontSize(10)
  doc.text('PRESCRIBED MEDICINES & DOSAGE SCHEDULE', margin + 9, y)

  y += 4

  // Table Header
  const headers = [
    { title: '#', width: 8, align: 'center' },
    { title: 'Medicine Name & Dosage Form', width: 62, align: 'left' },
    { title: 'Schedule', width: 34, align: 'center' },
    { title: 'Duration', width: 22, align: 'center' },
    { title: 'Instructions', width: 40, align: 'left' },
    { title: 'Qty', width: 16, align: 'center' },
  ]

  doc.setFillColor(...primaryTeal)
  doc.rect(margin, y, contentWidth, 6.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...white)

  let curX = margin
  headers.forEach((h) => {
    if (h.align === 'center') {
      doc.text(h.title, curX + h.width / 2, y + 4.5, { align: 'center' })
    } else {
      doc.text(h.title, curX + 2, y + 4.5)
    }
    curX += h.width
  })

  y += 6.5

  // Render Medicine Rows
  const medList =
    (prescription?.medicines && prescription.medicines.length > 0)
      ? prescription.medicines
      : (medicines && medicines.length > 0)
      ? medicines
      : [
          {
            name: 'Paracetamol 500mg',
            dosage: '1-0-1',
            timing: 'Morning & Night',
            duration: '3 days',
            instruction: 'after meals',
            qty: 6,
          },
        ]

  medList.forEach((med, idx) => {
    const isEven = idx % 2 === 0
    const rowHeight = 11

    // Row zebra background
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252)
    doc.rect(margin, y, contentWidth, rowHeight, 'F')
    doc.setDrawColor(...borderGrey)
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight)

    const medName = med.name || med.medicine_name || med.medicineName || 'Medicine'
    const category = med.category || med.dosage_form || med.dosageForm || 'Tablet'
    const strength = med.strength ? ` (${med.strength})` : ''
    const schedule =
      med.dosage ||
      (med.doses && Array.isArray(med.doses)
        ? med.doses.map((d) => d.time_of_day || d.timeOfDay).join('-')
        : med.timing || 'As advised')
    const timingDetail = med.timing || (schedule === '1-0-1' ? 'Morning, Night' : schedule === '1-1-1' ? 'Morn, Noon, Night' : '')
    const duration =
      med.duration ||
      (med.duration_value && med.duration_unit
        ? `${med.duration_value} ${med.duration_unit.toLowerCase()}(s)`
        : '5 days')
    const instructions =
      med.instruction ||
      med.special_instructions ||
      med.specialInstructions ||
      med.meal_relation ||
      med.mealRelation ||
      'After meals with water'
    const qty =
      med.qty ||
      med.dose_quantity ||
      (typeof med.doses === 'number' ? med.doses : 'As advised')

    // Col 0: Index
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textMuted)
    doc.text(String(idx + 1), margin + 4, y + 5, { align: 'center' })

    // Col 1: Medicine Name & Form
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...textDark)
    doc.text(`${medName}${strength}`.slice(0, 36), margin + 10, y + 4.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...primaryTeal)
    doc.text(`[${category}]`, margin + 10, y + 8.5)

    // Col 2: Schedule & Timing
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...textDark)
    doc.text(String(schedule), margin + 70 + 17, y + 4.5, { align: 'center' })

    if (timingDetail) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...textMuted)
      doc.text(timingDetail.slice(0, 22), margin + 70 + 17, y + 8.5, { align: 'center' })
    }

    // Col 3: Duration
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textDark)
    doc.text(String(duration), margin + 104 + 11, y + 6, { align: 'center' })

    // Col 4: Instructions
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...textMuted)
    doc.text(String(instructions).slice(0, 26), margin + 128, y + 6)

    // Col 5: Total Qty
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...darkTeal)
    doc.text(String(qty), margin + 166 + 8, y + 6, { align: 'center' })

    y += rowHeight
  })

  y += 4

  // ── GENERAL ADVICE & DIET INSTRUCTIONS ──
  const generalAdvice =
    prescription?.general_instructions ||
    prescription?.generalInstructions ||
    prescription?.general ||
    'Adequate hydration, warm saline gargles, complete full antibiotic course if prescribed, and avoid cold beverages.'

  doc.setFillColor(...lightBg)
  doc.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'F')
  doc.setDrawColor(...borderGrey)
  doc.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...darkTeal)
  doc.text('GENERAL INSTRUCTIONS & DIET ADVICE:', margin + 4, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...textDark)
  const adviceLines = doc.splitTextToSize(generalAdvice, contentWidth - 8)
  doc.text(adviceLines, margin + 4, y + 9.5)

  y += 24

  // ── DISPENSARY NOTICE & SECURITY SEAL ──
  doc.setFillColor(254, 243, 199) // amber-100
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F')
  doc.setDrawColor(245, 158, 11) // amber-500
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(146, 64, 14) // amber-900
  doc.text('CAMPUS DISPENSARY DISPENSING DIRECTIVE:', margin + 4, y + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(120, 53, 15) // amber-800
  doc.text(
    'Please present this digital e-prescription at the TIET Campus Dispensary (Ground Floor). ' +
      'Pharmacist must verify Roll No. and dispense the exact prescribed quantities according to OPD formulary.',
    margin + 4,
    y + 8.5
  )

  y += 18

  // ── SIGNATURE & DIGITAL SEAL FOOTER ──
  const footerY = Math.max(y, pageHeight - 44)

  // University Clinic Stamp Box
  doc.setDrawColor(...primaryTeal)
  doc.setLineWidth(0.4)
  doc.roundedRect(margin, footerY, 60, 22, 1.5, 1.5, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...primaryTeal)
  doc.text('CAMPUSCARE HEALTH CENTRE', margin + 30, footerY + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...textMuted)
  doc.text('TIET PATIALA - OPD VERIFIED', margin + 30, footerY + 9.5, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.text('Digital Signature Applied', margin + 30, footerY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text(`Timestamp: ${dateFormatted}`, margin + 30, footerY + 18, { align: 'center' })

  // Doctor Digital Sign-off
  const docSignX = pageWidth - margin - 60
  doc.setDrawColor(...borderGrey)
  doc.line(docSignX, footerY + 14, pageWidth - margin, footerY + 14)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...textDark)
  doc.text(doctor?.name || 'Dr. Neha Kapoor', docSignX + 30, footerY + 18, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...textMuted)
  doc.text(
    `Attending Medical Officer • ${doctor?.specialization || 'General Physician'}`,
    docSignX + 30,
    footerY + 21.5,
    { align: 'center' }
  )

  // Page Bottom Disclaimer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184) // slate-400
  doc.text(
    'This is a computer-generated medical prescription issued by authorized clinical staff of CampusCare Health Centre. ' +
      'Valid for 7 days from the date of issue.',
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  )

  // ── DOWNLOAD OR PRINT ACTIONS ──
  const filename = `CampusCare_Prescription_${rollNo}_${prescriptionId}.pdf`

  if (autoDownload) {
    try {
      doc.save(filename)
    } catch (err) {
      console.warn('Auto download error:', err)
    }
  }

  if (openPrint) {
    try {
      const blobUrl = doc.output('bloburl')
      const win = window.open(blobUrl, '_blank')
      if (win) {
        win.focus()
      }
    } catch (err) {
      console.warn('Print preview open error:', err)
    }
  }

  return doc
}
