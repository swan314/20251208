/**
 * @param {string} text
 */
export function hasKoreanBatchim(text) {
  if (!text) return false
  const char = text.charAt(text.length - 1)
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/**
 * @param {string} label
 */
export function withTopicParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '은' : '는'}`
}

/**
 * @param {string} label
 */
export function withSubjectParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '이' : '가'}`
}

/**
 * @param {string} label
 */
export function withObjectParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '을' : '를'}`
}

/**
 * @param {string} label
 */
export function withAndParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '과' : '와'}`
}

/**
 * @param {number} value
 */
export function withRoParticleForNumber(value) {
  const text = Number.isInteger(value) ? String(value) : String(value)
  const lastDigit = Math.abs(Number(value)) % 10

  if ([0, 1, 3, 6, 7, 8].includes(lastDigit)) {
    return `${text}으로`
  }

  return `${text}로`
}

/**
 * @param {string} label
 */
export function formatSubjectPossessive(label) {
  const trimmed = String(label ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.endsWith('이')) return `${trimmed}의`
  return `${trimmed}이의`
}

/**
 * @param {string} label
 */
export function formatSeriesLabelWithI(label) {
  const trimmed = String(label ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.endsWith('이')) return trimmed
  return `${trimmed}이`
}

/**
 * @param {string[]} labels
 */
export function formatSeriesNamesAnd(labels) {
  if (!labels?.length) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join('과 ')}과 ${labels[labels.length - 1]}`
}

/**
 * @param {string[]} labels
 */
export function formatSeriesNamesWithI(labels) {
  if (!labels?.length) return ''
  if (labels.length === 1) return formatSeriesLabelWithI(labels[0])
  return `${labels.slice(0, -1).map(formatSeriesLabelWithI).join('와 ')}와 ${formatSeriesLabelWithI(labels[labels.length - 1])}`
}

/**
 * @param {string} text
 */
export function wrapGraphConfirmation(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return '그래프에서 확인한 내용을 다시 살펴보세요.'
  if (trimmed.startsWith('그래프에서 확인하면')) return trimmed
  return `그래프에서 확인하면, ${trimmed}`
}

/**
 * @param {string[]} parts
 */
export function joinWithAnd(parts) {
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]}이고, ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}이고, ${parts[parts.length - 1]}`
}
