/**
 * CampusCare Medicine Formulary
 * Standard university health centre formulary catalog with structured medicine entries.
 */

export const MEDICINE_FORMULARY = [
  {
    id: 'MED-001',
    name: 'Paracetamol 500mg',
    genericName: 'Paracetamol / Acetaminophen',
    category: 'Tablet',
    strength: '500mg',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '3 days',
    defaultInstruction: 'after meals',
    unit: 'tablets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Fever, mild-to-moderate pain, headache',
  },
  {
    id: 'MED-002',
    name: 'Paracetamol 650mg (Dolo)',
    genericName: 'Paracetamol / Acetaminophen',
    category: 'Tablet',
    strength: '650mg',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '3 days',
    defaultInstruction: 'after meals',
    unit: 'tablets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'High fever, acute body ache, dengue/viral fever',
  },
  {
    id: 'MED-003',
    name: 'Cetirizine 10mg',
    genericName: 'Cetirizine Hydrochloride',
    category: 'Tablet',
    strength: '10mg',
    defaultDosage: '0-0-1',
    defaultTiming: 'Night',
    defaultDuration: '5 days',
    defaultInstruction: 'at bedtime',
    unit: 'tablets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Allergic rhinitis, sneezing, watery eyes, hives',
  },
  {
    id: 'MED-004',
    name: 'Amoxicillin 500mg',
    genericName: 'Amoxicillin Trihydrate',
    category: 'Capsule',
    strength: '500mg',
    defaultDosage: '1-1-1',
    defaultTiming: 'Three times a day',
    defaultDuration: '5 days',
    defaultInstruction: 'after meals',
    unit: 'capsules',
    allergyClass: 'Penicillin',
    isAntibiotic: true,
    indications: 'Bacterial infections of ear, nose, throat, or chest',
  },
  {
    id: 'MED-005',
    name: 'Augmentin 625mg',
    genericName: 'Amoxicillin + Clavulanic Acid',
    category: 'Tablet',
    strength: '625mg',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '5 days',
    defaultInstruction: 'with food',
    unit: 'tablets',
    allergyClass: 'Penicillin',
    isAntibiotic: true,
    indications: 'Resistant ENT infections, soft tissue infections',
  },
  {
    id: 'MED-006',
    name: 'Azithromycin 500mg',
    genericName: 'Azithromycin',
    category: 'Tablet',
    strength: '500mg',
    defaultDosage: '1-0-0',
    defaultTiming: 'Morning',
    defaultDuration: '3 days',
    defaultInstruction: '1 hr before or 2 hr after food',
    unit: 'tablets',
    allergyClass: 'Macrolide',
    isAntibiotic: true,
    indications: 'Lower respiratory tract infections, tonsillitis',
  },
  {
    id: 'MED-007',
    name: 'Pantoprazole 40mg',
    genericName: 'Pantoprazole Sodium',
    category: 'Tablet',
    strength: '40mg',
    defaultDosage: '1-0-0',
    defaultTiming: 'Morning',
    defaultDuration: '5 days',
    defaultInstruction: '30 mins before breakfast',
    unit: 'tablets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Acid reflux, gastritis, prophylaxis with NSAIDs',
  },
  {
    id: 'MED-008',
    name: 'Ibuprofen 400mg',
    genericName: 'Ibuprofen',
    category: 'Tablet',
    strength: '400mg',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '3 days',
    defaultInstruction: 'strictly after meals with full glass of water',
    unit: 'tablets',
    allergyClass: 'NSAID',
    isAntibiotic: false,
    indications: 'Musculoskeletal pain, sports injuries, acute sprains',
  },
  {
    id: 'MED-009',
    name: 'Oral Rehydration Salts (ORS)',
    genericName: 'WHO Standard Oral Electrolytes',
    category: 'Sachet',
    strength: '21.8g Sachet',
    defaultDosage: 'SOS',
    defaultTiming: 'As needed throughout day',
    defaultDuration: '3 days',
    defaultInstruction: 'dissolve 1 sachet completely in 1L clean drinking water',
    unit: 'sachets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Dehydration, acute gastroenteritis, heat exhaustion',
  },
  {
    id: 'MED-010',
    name: 'Cough Syrup 100ml (Dextromethorphan)',
    genericName: 'Dextromethorphan + Chlorpheniramine',
    category: 'Syrup',
    strength: '100ml Bottle',
    defaultDosage: '1-1-1',
    defaultTiming: '10ml thrice daily',
    defaultDuration: '5 days',
    defaultInstruction: 'after meals, avoid chilled drinks',
    unit: 'bottles',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Dry irritating cough, throat tickle',
  },
  {
    id: 'MED-011',
    name: 'Salbutamol Inhaler 100mcg',
    genericName: 'Salbutamol / Albuterol Sulfate',
    category: 'Inhaler',
    strength: '100mcg / 200 puffs',
    defaultDosage: 'SOS',
    defaultTiming: 'As needed upon wheezing',
    defaultDuration: '30 days',
    defaultInstruction: '2 puffs via spacer upon breathlessness',
    unit: 'inhaler',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Bronchospasm, bronchial asthma flare, acute wheeze',
  },
  {
    id: 'MED-012',
    name: 'Montelukast + Levocetirizine',
    genericName: 'Montelukast 10mg + Levocetirizine 5mg',
    category: 'Tablet',
    strength: '10mg/5mg',
    defaultDosage: '0-0-1',
    defaultTiming: 'Night',
    defaultDuration: '7 days',
    defaultInstruction: 'at bedtime',
    unit: 'tablets',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Allergic asthma, persistent allergic bronchitis',
  },
  {
    id: 'MED-013',
    name: 'Cotrimoxazole (Septran 480mg)',
    genericName: 'Trimethoprim + Sulfamethoxazole',
    category: 'Tablet',
    strength: '480mg',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '5 days',
    defaultInstruction: 'after food with plenty of water',
    unit: 'tablets',
    allergyClass: 'Sulfa',
    isAntibiotic: true,
    indications: 'UTI, susceptible bacterial infections',
  },
  {
    id: 'MED-014',
    name: 'Hydrocortisone Cream 1%',
    genericName: 'Hydrocortisone',
    category: 'Ointment',
    strength: '15g Tube',
    defaultDosage: '1-0-1',
    defaultTiming: 'Morning & Night',
    defaultDuration: '5 days',
    defaultInstruction: 'apply thin layer topically over clean affected area',
    unit: 'tubes',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'Contact dermatitis, eczema flare, insect bites',
  },
  {
    id: 'MED-015',
    name: 'Becosules Multivitamin',
    genericName: 'Vitamin B-Complex with Vitamin C',
    category: 'Capsule',
    strength: 'Therapeutic Capsule',
    defaultDosage: '1-0-0',
    defaultTiming: 'Morning',
    defaultDuration: '15 days',
    defaultInstruction: 'after breakfast',
    unit: 'capsules',
    allergyClass: null,
    isAntibiotic: false,
    indications: 'General weakness, mouth ulcers, nutritional replenishment',
  },
  {
    id: 'MED-016',
    name: 'Betadine 2% Gargle',
    genericName: 'Povidone-Iodine 2% w/v',
    category: 'Liquid',
    strength: '100ml Bottle',
    defaultDosage: '1-1-1',
    defaultTiming: 'Thrice daily',
    defaultDuration: '5 days',
    defaultInstruction: 'dilute with equal volume of warm water and gargle for 30s',
    unit: 'bottles',
    allergyClass: 'Iodine',
    isAntibiotic: false,
    indications: 'Pharyngitis, sore throat, oral hygiene in viral illness',
  },
]

export const FORMULARY_CATEGORIES = [
  'All',
  'Tablet',
  'Capsule',
  'Syrup',
  'Inhaler',
  'Ointment',
  'Sachet',
  'Liquid',
]

/**
 * Filter the formulary by search term and optional category
 */
export function searchMedicineFormulary(query = '', category = 'All') {
  const q = query.trim().toLowerCase()
  return MEDICINE_FORMULARY.filter((med) => {
    const matchesCategory = category === 'All' || med.category === category
    if (!matchesCategory) return false
    if (!q) return true
    return (
      med.name.toLowerCase().includes(q) ||
      med.genericName.toLowerCase().includes(q) ||
      med.indications.toLowerCase().includes(q) ||
      (med.allergyClass && med.allergyClass.toLowerCase().includes(q))
    )
  })
}

/**
 * Find a formulary medicine by exact ID or name match
 */
export function findFormularyMedicine(identifier) {
  if (!identifier) return null
  const term = identifier.trim().toLowerCase()
  return (
    MEDICINE_FORMULARY.find(
      (m) => m.id.toLowerCase() === term || m.name.toLowerCase() === term
    ) || null
  )
}

