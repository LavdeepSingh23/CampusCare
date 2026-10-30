/**
 * Dynamic M-A-N Dosage Formatter
 * Formats dosage schedule strings into dynamic Morning - Afternoon - Night notation.
 * e.g. "1-0-1" -> "M - N", "0-0-1" -> "N", "1-1-0" -> "M - A", "1-0-0" -> "M", "1-1-1" -> "M - A - N"
 */
export function formatDosageMAN(dosage) {
  if (!dosage) return 'M'
  const str = String(dosage).trim()
  const lower = str.toLowerCase()

  // Handle words: morning, afternoon, evening, night
  if (
    lower.includes('morning') ||
    lower.includes('afternoon') ||
    lower.includes('evening') ||
    lower.includes('night') ||
    lower.includes('bedtime')
  ) {
    const parts = []
    if (lower.includes('morning')) parts.push('M')
    if (lower.includes('afternoon') || lower.includes('evening')) parts.push('A')
    if (lower.includes('night') || lower.includes('bedtime')) parts.push('N')
    if (parts.length > 0) return parts.join(' - ')
  }

  // Parse standard 1-0-1 or 1-1-0 or 0-0-1 or 1-1-1 or 1-0-0
  const parts = str.split('-').map((p) => p.trim())
  if (parts.length === 3) {
    const active = []
    if (parts[0] === '1') active.push('M')
    if (parts[1] === '1') active.push('A')
    if (parts[2] === '1') active.push('N')
    return active.length > 0 ? active.join(' - ') : 'SOS'
  }

  // If already in isolated M, A, N letters
  if (/^[MAN\s\-/,]+$/i.test(str)) {
    const isM = /M/i.test(str)
    const isA = /A/i.test(str)
    const isN = /N/i.test(str)
    const parts = []
    if (isM) parts.push('M')
    if (isA) parts.push('A')
    if (isN) parts.push('N')
    return parts.length > 0 ? parts.join(' - ') : 'SOS'
  }

  // Clinical abbreviations
  if (lower === 'od') return 'M'
  if (lower === 'bd' || lower === 'bid') return 'M - N'
  if (lower === 'tid') return 'M - A - N'
  if (lower === 'qid') return 'M - A - N (4x)'
  if (lower === 'hs') return 'N'
  if (lower === 'sos' || lower === 'prn') return 'SOS'

  return str
}


