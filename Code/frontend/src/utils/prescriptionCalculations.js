/**
 * CampusCare Prescription Calculations & Validation Utility
 * Handles dose-schedule parsing, duration calculations, automatic quantity estimation,
 * allergy conflict detection, and validation states for the clinical prescription desk.
 */

/**
 * Standard frequency mapping for medical abbreviations
 */
const ABBREVIATION_MAP = {
  od: { dosesPerDay: 1, normalized: '1-0-0', desc: 'Once daily' },
  bd: { dosesPerDay: 2, normalized: '1-0-1', desc: 'Twice daily' },
  bid: { dosesPerDay: 2, normalized: '1-0-1', desc: 'Twice daily' },
  tid: { dosesPerDay: 3, normalized: '1-1-1', desc: 'Thrice daily' },
  qid: { dosesPerDay: 4, normalized: '1-1-1-1', desc: 'Four times daily' },
  hs: { dosesPerDay: 1, normalized: '0-0-1', desc: 'At bedtime' },
  sos: { dosesPerDay: 1, normalized: 'SOS', desc: 'As needed' },
  prn: { dosesPerDay: 1, normalized: 'SOS', desc: 'As needed' },
}

/**
 * Common allergy classes and their associated drug keywords
 */
export const ALLERGEN_KEYWORD_MAP = {
  penicillin: ['amoxicillin', 'ampicillin', 'augmentin', 'penicillin', 'cloxacillin'],
  sulfa: ['sulfa', 'sulfamethoxazole', 'cotrimoxazole', 'septran', 'sulfonamide'],
  nsaid: ['ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'ketorolac', 'aceclofenac', 'mefenamic'],
  iodine: ['iodine', 'betadine', 'povidone'],
  latex: ['latex'],
  dust: ['dust'],
}

/**
 * Parse and validate a dose-schedule string (e.g. "1-0-1", "1-1-1", "SOS", "BD")
 */
export function parseDosageSchedule(dosage) {
  if (!dosage || typeof dosage !== 'string') {
    return {
      isValid: false,
      dosesPerDay: 0,
      isSOS: false,
      morning: false,
      afternoon: false,
      night: false,
      normalizedCode: '',
      error: 'Dose schedule is required',
    }
  }

  const clean = dosage.trim()
  const lower = clean.toLowerCase()

  // Check abbreviation lookup (OD, BD, TID, etc.)
  if (ABBREVIATION_MAP[lower]) {
    const entry = ABBREVIATION_MAP[lower]
    return {
      isValid: true,
      dosesPerDay: entry.dosesPerDay,
      isSOS: entry.normalized === 'SOS',
      morning: entry.normalized.startsWith('1'),
      afternoon: entry.normalized.includes('-1-'),
      night: entry.normalized.endsWith('1'),
      normalizedCode: entry.normalized,
      error: null,
    }
  }

  // Handle SOS string
  if (lower.includes('sos') || lower.includes('as needed') || lower.includes('prn')) {
    return {
      isValid: true,
      dosesPerDay: 1,
      isSOS: true,
      morning: false,
      afternoon: false,
      night: false,
      normalizedCode: 'SOS',
      error: null,
    }
  }

  // Parse pattern like "1-0-1", "1-1-1", "0-0-1", "2-0-2"
  const parts = clean.split('-')
  if (parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^\d+$/.test(p.trim()))) {
    const numbers = parts.map((p) => parseInt(p.trim(), 10))
    const totalDoses = numbers.reduce((acc, curr) => acc + curr, 0)

    return {
      isValid: totalDoses > 0,
      dosesPerDay: totalDoses,
      isSOS: false,
      morning: (numbers[0] || 0) > 0,
      afternoon: (numbers[1] || 0) > 0,
      night: (numbers[2] || 0) > 0,
      normalizedCode: clean,
      error: totalDoses === 0 ? 'Schedule must contain at least one dose' : null,
    }
  }

  // Fallback for custom text
  return {
    isValid: clean.length > 0,
    dosesPerDay: 1,
    isSOS: false,
    morning: true,
    afternoon: false,
    night: false,
    normalizedCode: clean,
    error: null,
  }
}

/**
 * Format a 3-part schedule code from boolean time flags
 */
export function formatDosageCode(morning, afternoon, night) {
  return `${morning ? 1 : 0}-${afternoon ? 1 : 0}-${night ? 1 : 0}`
}

/**
 * Parse duration string or number into day count
 * Handles "3 days", "5 days", "1 week", "2 weeks", "30 days", "1 month", etc.
 */
export function parseDurationInDays(duration) {
  if (typeof duration === 'number') {
    return duration > 0 ? Math.round(duration) : 3
  }
  if (!duration || typeof duration !== 'string') return 3

  const clean = duration.trim().toLowerCase()

  // Weeks
  const weekMatch = clean.match(/^(\d+)\s*(?:week|weeks|wk|wks)/)
  if (weekMatch) {
    return parseInt(weekMatch[1], 10) * 7
  }

  // Months
  const monthMatch = clean.match(/^(\d+)\s*(?:month|months|mo)/)
  if (monthMatch) {
    return parseInt(monthMatch[1], 10) * 30
  }

  // Days
  const dayMatch = clean.match(/^(\d+)/)
  if (dayMatch) {
    return Math.max(1, parseInt(dayMatch[1], 10))
  }

  return 3 // sensible OPD default
}

/**
 * Calculate quantity automatically based on dose schedule, duration, and medicine form
 */
export function calculatePrescriptionQuantity(dosage, duration, categoryOrUnit = 'Tablet') {
  const durationDays = parseDurationInDays(duration)
  const parsedSchedule = parseDosageSchedule(dosage)
  const category = (categoryOrUnit || '').toLowerCase()

  // Unit forms that are dispensed as whole containers
  const isBottledOrPack =
    category.includes('syrup') ||
    category.includes('inhaler') ||
    category.includes('ointment') ||
    category.includes('cream') ||
    category.includes('liquid') ||
    category.includes('drop') ||
    category.includes('spray')

  if (isBottledOrPack) {
    // 1 container for courses up to 15 days, 2 containers for longer courses
    return durationDays > 15 ? 2 : 1
  }

  // Sachet forms (like ORS)
  if (category.includes('sachet')) {
    if (parsedSchedule.isSOS) {
      return Math.min(10, Math.max(3, durationDays))
    }
    return Math.max(1, parsedSchedule.dosesPerDay * durationDays)
  }

  // Tablets, Capsules, General Unit doses
  if (parsedSchedule.isSOS) {
    // For SOS tablets (e.g. Paracetamol SOS, pain SOS), suggest a safe symptomatic pack
    return Math.max(4, Math.min(10, durationDays * 2))
  }

  const dailyDose = parsedSchedule.dosesPerDay || 1
  return Math.max(1, dailyDose * durationDays)
}

/**
 * Check if a medication causes an allergy conflict with patient declared allergies
 */
export function checkDrugAllergyConflict(drug, patientAllergies = []) {
  if (!patientAllergies || !Array.isArray(patientAllergies) || patientAllergies.length === 0) {
    return { hasConflict: false, allergen: null, warningMessage: null }
  }

  const medName = typeof drug === 'string' ? drug : drug?.name || ''
  const genericName = typeof drug === 'object' ? drug?.genericName || '' : ''
  const medAllergyClass = typeof drug === 'object' ? drug?.allergyClass || '' : ''

  const combinedMedText = `${medName} ${genericName} ${medAllergyClass}`.toLowerCase()

  for (const allergy of patientAllergies) {
    if (!allergy || typeof allergy !== 'string' || allergy.toLowerCase() === 'none declared') {
      continue
    }

    const patientAllergen = allergy.trim().toLowerCase()

    // 1. Direct class match
    if (medAllergyClass && medAllergyClass.toLowerCase().includes(patientAllergen)) {
      return {
        hasConflict: true,
        allergen: allergy,
        warningMessage: `⚠️ ALLERGY WARNING: Patient has a known allergy to "${allergy}". ${medName} belongs to the ${medAllergyClass} class.`,
      }
    }

    // 2. Direct string match
    if (combinedMedText.includes(patientAllergen)) {
      return {
        hasConflict: true,
        allergen: allergy,
        warningMessage: `⚠️ ALLERGY WARNING: Patient has a known allergy to "${allergy}". ${medName} contains matching compounds.`,
      }
    }

    // 3. Keyword / cross-reactivity lookup
    for (const [key, keywords] of Object.entries(ALLERGEN_KEYWORD_MAP)) {
      if (patientAllergen.includes(key)) {
        const matchesKeyword = keywords.some((kw) => combinedMedText.includes(kw))
        if (matchesKeyword) {
          return {
            hasConflict: true,
            allergen: allergy,
            warningMessage: `⚠️ ALLERGY WARNING: Patient is allergic to ${allergy} (${key.toUpperCase()}). ${medName} is contraindicated.`,
          }
        }
      }
    }
  }

  return { hasConflict: false, allergen: null, warningMessage: null }
}

/**
 * Validate an individual prescription draft item
 */
export function validatePrescriptionItem(item, patientAllergies = []) {
  const errors = []
  const warnings = []

  if (!item || !item.name || !item.name.trim()) {
    errors.push('Medicine name is required')
  }

  const scheduleInfo = parseDosageSchedule(item?.dosage || '')
  if (!scheduleInfo.isValid) {
    errors.push('Valid dosage schedule is required (e.g. 1-0-1, 1-1-1, SOS)')
  }

  const durationDays = parseDurationInDays(item?.duration)
  if (!durationDays || durationDays <= 0) {
    errors.push('Duration must be at least 1 day')
  }

  const qty = parseInt(item?.qty, 10)
  if (isNaN(qty) || qty <= 0) {
    errors.push('Quantity must be at least 1 unit')
  }

  // Check allergy warning
  const allergyCheck = checkDrugAllergyConflict(item, patientAllergies)
  if (allergyCheck.hasConflict) {
    warnings.push(allergyCheck.warningMessage)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    hasAllergyConflict: allergyCheck.hasConflict,
    allergyWarning: allergyCheck.warningMessage,
  }
}

/**
 * Validate an entire prescription draft before consultation completion
 */
export function validatePrescriptionDraft({
  diagnosis = '',
  complaint = '',
  clinicalNotes = '',
  medicines = [],
  patientAllergies = [],
}) {
  const errors = []
  const warnings = []

  if (!diagnosis.trim() && !complaint.trim()) {
    errors.push('Please enter a clinical diagnosis for this consultation')
  }

  if (!Array.isArray(medicines) || medicines.length === 0) {
    warnings.push('No medications currently prescribed in this draft')
  }

  let hasAllergyConflicts = false
  const validatedMedicines = medicines.map((med, index) => {
    const itemValidation = validatePrescriptionItem(med, patientAllergies)
    if (!itemValidation.isValid) {
      errors.push(`Medication #${index + 1} (${med.name || 'Unnamed'}): ${itemValidation.errors.join(', ')}`)
    }
    if (itemValidation.hasAllergyConflict) {
      hasAllergyConflicts = true
      warnings.push(`Medication #${index + 1} (${med.name}): ${itemValidation.allergyWarning}`)
    }
    return {
      ...med,
      validation: itemValidation,
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    hasAllergyConflicts,
    validatedMedicines,
    totalMedicines: medicines.length,
  }
}

