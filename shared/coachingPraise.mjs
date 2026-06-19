import { formatSubjectPossessive, withObjectParticle, withTopicParticle } from './koreanParticles.mjs'

/**
 * @param {string} text
 */
function normalizeAnswer(text) {
  return String(text ?? '').replace(/\s+/g, '').toLowerCase()
}

/**
 * @param {string} answer
 */
export function isGiveUpAnswer(answer) {
  const normalized = normalizeAnswer(answer)
  return ['모르겠', '모름', '잘모르', '글쎄', '답을모르', '헷갈', '어려워'].some((token) =>
    normalized.includes(token),
  )
}

/**
 * @param {string} text
 * @param {string} label
 */
function includesLabel(text, label) {
  if (!label) return false
  return normalizeAnswer(text).includes(normalizeAnswer(label))
}

/**
 * @param {string[]} pool
 */
function pickRandom(pool) {
  if (!pool.length) return ''
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * @param {string} x
 * @param {string} xUnit
 */
function formatXValue(x, xUnit) {
  const value = Number.isInteger(x) ? String(x) : String(x)
  return `${value}${xUnit}`
}

const GIVE_UP_PRAISES = [
  '괜찮아요. 그래프를 하나씩 살펴보면서 답을 찾아봅시다.',
  '모르겠다고 해도 괜찮아요. 그래프를 천천히 다시 보며 찾아볼까요?',
  '헷갈릴 수 있어요. 그래프에서 먼저 볼 부분부터 함께 찾아봅시다.',
  '어려운 문제예요. 그래프를 차근차근 살펴보며 시작해 봅시다.',
  '답을 모른다고 해도 괜찮아요. 그래프를 하나씩 확인해 볼까요?',
]

const WRONG_PRAISES = [
  '답을 적어 보려는 시도는 좋습니다. 그래프에서 필요한 정보를 찾아볼까요?',
  '생각해 본 흔적이 보여요. 그래프에서 어떤 부분을 봐야 할지 함께 찾아봅시다.',
  '답을 써 본 점은 좋아요. 그래프를 다시 보며 필요한 정보를 찾아볼까요?',
  '시도한 것 자체가 좋습니다. 그래프에서 먼저 확인할 부분을 찾아봅시다.',
  '스스로 답을 써 보려고 한 점이 좋아요. 그래프를 보며 단서를 찾아볼까요?',
]

const PARTIAL_GENERIC_PRAISES = [
  '일부 정보를 떠올려 본 점이 좋아요. 그래프에서 아직 찾지 못한 부분을 더 살펴봅시다.',
  '시작은 잘했어요. 그래프를 보며 빠진 정보를 하나씩 더 찾아볼까요?',
  '방향을 잡으려고 한 점이 좋아요. 그래프에서 필요한 정보를 더 확인해 봅시다.',
  '답의 일부를 생각해 본 점이 좋아요. 그래프에서 나머지 정보도 찾아볼까요?',
]

const NUMBERS_ONLY_PRAISES = [
  '그래프에서 값을 읽으려고 한 점이 좋아요. 이제 그 값이 무엇을 의미하는지도 생각해 볼까요?',
  '숫자를 찾으려고 한 시도가 좋아요. 그래프에서 읽은 값을 문장으로 연결해 봅시다.',
  '값을 읽어 보려고 한 점이 좋아요. 그래프에서 확인한 내용을 문장으로 표현해 볼까요?',
  '그래프에서 수치를 찾으려고 한 점이 좋아요. 이제 무엇을 나타내는지도 써 볼까요?',
]

const COMPLETE_PRAISES = [
  '맞게 읽었습니다.',
  '그래프에서 정확하게 확인했어요.',
  '그래프를 잘 해석했어요.',
  '필요한 정보를 정확히 찾았어요.',
  '그래프에서 답을 잘 확인했어요.',
]

/**
 * @param {string} xText
 */
export function pickPointValueXOnlyPraise(xText) {
  return pickRandom([
    `${xText}이라는 위치를 잘 찾았어요.`,
    `${xText}에 해당하는 위치를 잘 찾았어요.`,
    `${xText}까지는 그래프에서 잘 찾았어요.`,
    `${xText}에 해당하는 점을 잘 찾았어요.`,
    `${xText}을 그래프에서 잘 확인했어요.`,
  ])
}

/**
 * @param {string} timePhrase
 * @param {string[]} seriesLabels
 * @param {string} yLabel
 */
export function pickPointValueMultiSeriesCompletePraise(timePhrase, seriesLabels, yLabel) {
  const subjectText =
    seriesLabels.length >= 2
      ? `${seriesLabels.slice(0, -1).join('이와 ')}이와 ${seriesLabels[seriesLabels.length - 1]}이`
      : `${seriesLabels[0]}이`

  return pickRandom([
    `${timePhrase} ${subjectText}의 ${yLabel}를 모두 정확히 읽었어요.`,
    `${timePhrase} 두 사람의 ${yLabel}를 모두 정확히 확인했어요.`,
    `${timePhrase} ${subjectText}의 ${yLabel}를 모두 잘 읽었어요.`,
    `${timePhrase} 필요한 ${yLabel} 값을 모두 정확히 찾았어요.`,
  ])
}

/**
 * @param {string} foundLabel
 * @param {string} missingLabel
 * @param {string} yLabel
 */
export function pickMissingSeriesPraise(foundLabel, missingLabel, yLabel) {
  const foundSubject = formatSubjectPossessive(foundLabel)
  const missingSubject = formatSubjectPossessive(missingLabel)

  return pickRandom([
    `${foundSubject} ${withTopicParticle(yLabel)} 찾은 것 같아요. ${missingSubject} ${withTopicParticle(yLabel)} 얼마인지도 그래프에서 확인해 볼까요?`,
    `${foundSubject} ${withTopicParticle(yLabel)} 잘 읽었어요. ${missingSubject} ${yLabel}도 그래프에서 찾아볼까요?`,
    `${foundSubject} ${withTopicParticle(yLabel)} 확인한 점이 좋아요. ${missingSubject} ${yLabel}도 함께 읽어 볼까요?`,
    `${foundSubject} ${withTopicParticle(yLabel)} 찾은 것 같아요. ${missingSubject} ${withObjectParticle(yLabel)} 그래프에서 확인해 볼까요?`,
  ])
}

/**
 * @param {{ xLabel: string, yLabel: string, xUnit: string }} meta
 * @param {string} studentAnswer
 */
function buildPartialPraises(meta, studentAnswer) {
  const hasX = includesLabel(studentAnswer, meta.xLabel)
  const hasY = includesLabel(studentAnswer, meta.yLabel)
  const xObject = withObjectParticle(meta.xLabel)
  const yObject = withObjectParticle(meta.yLabel)

  if (hasX && !hasY) {
    return [
      `${withObjectParticle(meta.xLabel)} 떠올려 본 점이 좋아요. 그래프에서 ${yObject} 찾아볼까요?`,
      `가로축 정보를 생각해 본 점이 좋아요. 이제 ${yObject} 읽어 볼까요?`,
      `${xObject} 확인하려고 한 점이 좋아요. 그래프에서 ${yObject} 더 찾아봅시다.`,
      `${meta.xLabel}까지는 잘 봤어요. 그래프에서 ${yObject} 확인해 볼까요?`,
    ]
  }

  if (hasY && !hasX) {
    return [
      `${withObjectParticle(meta.yLabel)} 떠올려 본 점이 좋아요. 그래프에서 ${xObject} 함께 확인해 볼까요?`,
      `${yObject} 생각해 본 점이 좋아요. 그래프에서 ${xObject} 찾아볼까요?`,
      `${meta.yLabel}까지는 잘 봤어요. 그래프에서 ${xObject} 더 확인해 봅시다.`,
      `${yObject} 떠올린 점이 좋아요. 그래프에서 ${xObject} 함께 찾아볼까요?`,
    ]
  }

  return PARTIAL_GENERIC_PRAISES
}

/**
 * @param {{ xLabel: string, yLabel: string, xUnit: string }} meta
 * @param {{ x?: number }} target
 */
function buildClosePraises(meta, target) {
  const yObject = withObjectParticle(meta.yLabel)
  const xText =
    target.x !== undefined ? formatXValue(target.x, meta.xUnit) : meta.xLabel

  if (target.x !== undefined) {
    return [
      `그래프에서 ${xText}에 해당하는 ${yObject} 잘 읽었어요.`,
      `${xText}에서 ${meta.yLabel} 값을 거의 맞게 찾았어요.`,
      `${xText}에 해당하는 값을 잘 찾았어요. 이제 문장으로 표현해 볼까요?`,
      `그래프에서 ${xText}의 ${withObjectParticle(meta.yLabel)} 거의 정확히 읽었어요.`,
      `${xText}에서 필요한 ${meta.yLabel} 값을 잘 확인했어요.`,
    ]
  }

  return [
    `그래프에서 ${meta.yLabel} 값을 거의 맞게 찾았어요.`,
    `${withObjectParticle(meta.yLabel)} 잘 읽었어요. 이제 문장으로 표현해 볼까요?`,
    `필요한 ${meta.yLabel} 값을 거의 정확히 찾았어요.`,
    `그래프에서 ${yObject} 잘 확인했어요.`,
  ]
}

/**
 * @typedef {'complete' | 'close' | 'numbers_only' | 'wrong' | 'partial' | 'give_up'} AnswerQuality
 */

/**
 * @param {AnswerQuality} quality
 * @param {{
 *   studentAnswer: string,
 *   meta: { xLabel: string, yLabel: string, xUnit: string },
 *   target: { x?: number },
 * }} params
 */
export function pickPraiseForQuality(quality, { studentAnswer, meta, target }) {
  if (quality === 'give_up' || isGiveUpAnswer(studentAnswer)) {
    return pickRandom(GIVE_UP_PRAISES)
  }

  if (quality === 'complete') {
    return pickRandom(COMPLETE_PRAISES)
  }

  if (quality === 'close') {
    return pickRandom(buildClosePraises(meta, target))
  }

  if (quality === 'numbers_only') {
    return pickRandom(NUMBERS_ONLY_PRAISES)
  }

  if (quality === 'partial') {
    return pickRandom(buildPartialPraises(meta, studentAnswer))
  }

  return pickRandom(WRONG_PRAISES)
}
