import { parseSeriesFromPoints } from './graph.js'
import { buildSectionRangePhrase } from './questions.js'
import {
  parseCoachingResponse,
} from '../shared/coachingPrompt.mjs'
import {
  getCoachingHelp,
  getCoachingSteps,
} from '../shared/coachingSteps.mjs'
import { isGiveUpAnswer } from '../shared/coachingPraise.mjs'
import {
  formatSeriesNamesWithI,
  formatSubjectPossessive,
  joinWithAnd,
  withAndParticle,
  withObjectParticle,
  withSubjectParticle,
  withTopicParticle,
  wrapGraphConfirmation,
} from '../shared/koreanParticles.mjs'

export { parseCoachingResponse }

/** @type {Map<string, { coachingGoal: string, coachingStrategy: string }>} */
const coachingRulesByRuleName = new Map()

/**
 * @param {Record<string, string>[]} rows
 */
export function initCoachingRules(rows) {
  coachingRulesByRuleName.clear()

  rows.forEach((row) => {
    const ruleName = row.ruleName?.trim()
    if (!ruleName) return

    coachingRulesByRuleName.set(ruleName, {
      coachingGoal: row.coachingGoal?.trim() ?? '',
      coachingStrategy: row.coachingStrategy?.trim() ?? '',
    })
  })
}

/**
 * @param {{
 *   problem: Record<string, string>,
 *   question: {
 *     text: string,
 *     ruleName: string,
 *     questionSet: string,
 *     section?: {
 *       xStart: number,
 *       xEnd: number,
 *       yStart: number,
 *       yEnd: number,
 *       isMultiSeries?: boolean,
 *     },
 *   },
 *   studentAnswer: string,
 *   hintLevel: number,
 * }} params
 */
export function buildCoachingContext({ problem, question, studentAnswer, hintLevel }) {
  const rule = coachingRulesByRuleName.get(question.ruleName) ?? {
    coachingGoal: '그래프를 다시 보며 답을 스스로 찾도록 돕는다.',
    coachingStrategy: '그래프의 점, 구간, 변화를 차례로 확인하게 한다.',
  }

  const xUnit = problem.xUnit?.trim() ?? ''
  const primaryPoints = parseSeriesFromPoints(problem.questionPoints ?? problem.points ?? '')[0]?.points ?? []
  const focusX =
    extractXFromQuestion(question.text?.trim() ?? '', xUnit)
    ?? pickRepresentativeX(primaryPoints.map((point) => point.x))
  const xLabel = problem.xLabel?.trim() ?? ''
  const xText = focusX !== null ? formatXValue(focusX, xUnit) : xLabel
  const section = question.section ?? null
  const sectionStartText =
    section !== null ? formatXValue(section.xStart, xUnit) : ''
  const sectionEndText =
    section !== null ? formatXValue(section.xEnd, xUnit) : ''
  const sectionRangeText =
    section !== null ? buildSectionRangePhrase(problem, section.xStart, section.xEnd) : ''

  return {
    title: problem.title?.trim() ?? '',
    graphType: problem.graphType?.trim() ?? '',
    questionSet: question.questionSet?.trim() ?? '',
    question: question.text?.trim() ?? '',
    studentAnswer: studentAnswer.trim(),
    questionPoints: (problem.questionPoints ?? problem.points ?? '').trim(),
    hintLevel,
    ruleName: question.ruleName?.trim() ?? '',
    coachingGoal: rule.coachingGoal,
    coachingStrategy: rule.coachingStrategy,
    xLabel,
    yLabel: problem.yLabel?.trim() ?? '',
    xUnit,
    yUnit: problem.yUnit?.trim() ?? '',
    xText,
    section,
    sectionStartText,
    sectionEndText,
    sectionRangeText,
  }
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function formatXValue(x, xUnit) {
  return `${formatNumber(x)}${xUnit}`
}

function formatYValue(y, yUnit) {
  return `${formatNumber(y)}${yUnit}`
}

function formatPointCoords(x, y) {
  return `(${formatNumber(x)}, ${formatNumber(y)})`
}

function buildTimePhraseForAnswer(xText, questionText) {
  if (questionText.includes('후')) return `${xText} 후`
  if (questionText.includes('동안')) return `${xText} 동안`
  if (questionText.includes('지난')) return `${withSubjectParticle(xText)} 지난 후`
  return `${xText}일 때`
}

/**
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @param {number} x
 */
function getLabeledSeriesValuesAtX(meta, x) {
  return meta.series
    .filter((entry) => entry.label && entry.points.length)
    .map((entry) => ({
      label: entry.label,
      y: findYAtX(entry.points, x),
    }))
    .filter((entry) => entry.y !== null)
}

/**
 * @param {string} timePhrase
 * @param {string} yLabel
 * @param {string} yUnit
 * @param {{ label: string, y: number }[]} entries
 */
function buildMultiSeriesYAnswer(timePhrase, yLabel, yUnit, entries) {
  const parts = entries.map(
    (entry) => `${formatSubjectPossessive(entry.label)} ${withTopicParticle(yLabel)} ${formatYValue(entry.y, yUnit)}`,
  )

  return wrapGraphConfirmation(`${timePhrase} ${joinWithAnd(parts)}입니다.`)
}

/**
 * @param {string} xText
 * @param {string} yLabel
 * @param {string} yUnit
 * @param {{ label: string, y: number }[]} entries
 */
function buildComparisonFinalReferenceAnswer(xText, yLabel, yUnit, entries) {
  const timePhrase = `${xText} 후`

  if (entries.length >= 2 && entries.every((entry) => approxEqual(entry.y, entries[0].y))) {
    const yText = formatYValue(entries[0].y, yUnit)

    if (yLabel === '거리') {
      return wrapGraphConfirmation(`${timePhrase} 두 사람 모두 ${yText}를 이동했습니다.`)
    }

    return wrapGraphConfirmation(`${timePhrase} 두 사람 모두 ${withTopicParticle(yLabel)} ${yText}입니다.`)
  }

  return buildMultiSeriesYAnswer(timePhrase, yLabel, yUnit, entries)
}

function buildPointValueReferenceAnswer(xText, yLabel, yText, questionText, yUnit, multiSeriesEntries = null) {
  const timePhrase = buildTimePhraseForAnswer(xText, questionText)

  if (multiSeriesEntries && multiSeriesEntries.length >= 2) {
    return buildMultiSeriesYAnswer(timePhrase, yLabel, yUnit, multiSeriesEntries)
  }

  return wrapGraphConfirmation(`${timePhrase} ${withTopicParticle(yLabel)} ${yText}입니다.`)
}

function normalizeAnswer(text) {
  return String(text ?? '').replace(/\s+/g, '').toLowerCase()
}

function extractNumbers(text) {
  return [...String(text ?? '').matchAll(/(\d+\.?\d*)/g)].map((match) => Number.parseFloat(match[1]))
}

function includesLabel(text, label) {
  if (!label) return false
  return normalizeAnswer(text).includes(normalizeAnswer(label))
}

function getProblemMeta(problem) {
  const series = parseSeriesFromPoints(problem.questionPoints ?? problem.points ?? '')

  return {
    xLabel: problem.xLabel?.trim() || '가로축',
    yLabel: problem.yLabel?.trim() || '세로축',
    xUnit: problem.xUnit?.trim() ?? '',
    yUnit: problem.yUnit?.trim() ?? '',
    series,
    primaryPoints: series[0]?.points ?? [],
    problem,
  }
}

function extractXFromQuestion(questionText, xUnit) {
  if (xUnit) {
    const unitPattern = new RegExp(`(\\d+\\.?\\d*)\\s*${xUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const unitMatch = questionText.match(unitPattern)
    if (unitMatch) return Number.parseFloat(unitMatch[1])
  }

  const numbers = extractNumbers(questionText)
  return numbers.length ? numbers[0] : null
}

function pickRepresentativeX(xValues) {
  const sorted = [...new Set(xValues)].sort((a, b) => a - b)
  if (!sorted.length) return null

  const candidates = sorted.length > 1 && approxEqual(sorted[0], 0) ? sorted.slice(1) : sorted
  return candidates[Math.floor((candidates.length - 1) / 2)] ?? null
}

function findYAtX(points, x) {
  const exact = points.find((point) => approxEqual(point.x, x))
  if (exact) return exact.y

  const sorted = [...points].sort((a, b) => a.x - b.x)
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]
    const end = sorted[index + 1]
    if (x >= start.x && x <= end.x) {
      if (approxEqual(start.x, end.x)) return start.y
      const ratio = (x - start.x) / (end.x - start.x)
      return start.y + (end.y - start.y) * ratio
    }
  }

  return null
}

function findConstantSections(points) {
  const sections = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (approxEqual(start.y, end.y) && !approxEqual(start.x, end.x)) {
      sections.push({ xStart: start.x, xEnd: end.x, y: start.y })
    }
  }

  return sections
}

function findExtremePoints(points, mode) {
  if (!points.length) return null
  return points.reduce((selected, point) => {
    if (mode === 'max') return point.y > selected.y ? point : selected
    return point.y < selected.y ? point : selected
  })
}

function isNumericAnswerCorrect(studentAnswer, expectedNumbers, tolerance = 0.2) {
  const studentNumbers = extractNumbers(studentAnswer)
  if (!studentNumbers.length || !expectedNumbers.length) return false

  return expectedNumbers.every((expected) =>
    studentNumbers.some((value) => Math.abs(value - expected) <= tolerance),
  )
}

function isAnswerCloseToText(studentAnswer, expectedTexts) {
  const normalized = normalizeAnswer(studentAnswer)
  return expectedTexts.some((text) => normalized.includes(normalizeAnswer(text)))
}

/**
 * @typedef {Object} CoachingTarget
 * @property {number} [x]
 * @property {number} [y]
 * @property {number[]} [expectedNumbers]
 * @property {string[]} [expectedTexts]
 * @property {string} referenceAnswer
 * @property {string} level1Question
 * @property {string} level2Question
 * @property {string} [sectionStartText]
 * @property {string} [sectionEndText]
 * @property {string} [sectionRangeText]
 * @property {string} [yStartText]
 * @property {string} [yEndText]
 * @property {'constant' | 'increase' | 'decrease'} [sectionDirection]
 * @property {boolean} [isMultiSeriesSection]
 * @property {{ label: string, yStart: number, yEnd: number, direction: 'constant' | 'increase' | 'decrease' }[]} [seriesSectionExpectations]
 */

function getSeriesLabels(meta) {
  return meta.series.filter((entry) => entry.label).map((entry) => entry.label)
}

function isMultiSeriesGraph(meta) {
  return getSeriesLabels(meta).length >= 2
}

function getComparisonEndX(meta) {
  const endXs = meta.series
    .filter((entry) => entry.points.length)
    .map((entry) => entry.points[entry.points.length - 1].x)

  return endXs.length ? Math.max(...endXs) : null
}

/**
 * @param {string} answer
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 */
function getSeriesValueMatchStatus(answer, target, meta) {
  const expectedX = target.x
  if (expectedX === undefined) {
    return { valuesAtX: [], found: [], missing: [] }
  }

  const valuesAtX = getLabeledSeriesValuesAtX(meta, expectedX)
  if (valuesAtX.length < 2) {
    return { valuesAtX, found: [], missing: [] }
  }

  const studentNumbers = extractNumbers(answer)
  let found = valuesAtX.filter((entry) => {
    const hasLabel = includesLabel(answer, entry.label)
    const hasValue = studentNumbers.some((value) => Math.abs(value - entry.y) <= VALUE_MATCH_TOLERANCE)
    return hasLabel && hasValue
  })

  if (!found.length && studentNumbers.length === 1) {
    const valueMatches = valuesAtX.filter((entry) =>
      Math.abs(entry.y - studentNumbers[0]) <= VALUE_MATCH_TOLERANCE,
    )

    if (valueMatches.length === 1) {
      found = [valueMatches[0]]
    }
  }

  const foundLabels = new Set(found.map((entry) => entry.label))
  const missing = valuesAtX.filter((entry) => !foundLabels.has(entry.label))

  return { valuesAtX, found, missing }
}

function hasPartialSeriesValues(answer, target, meta) {
  const { found, missing } = getSeriesValueMatchStatus(answer, target, meta)
  return found.length >= 1 && missing.length >= 1
}

/**
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @param {string} [xText]
 * @returns {CoachingTarget}
 */
function finalizeCoachingTarget(target, ruleName, meta, xText) {
  const labels = {
    xLabel: meta.xLabel,
    yLabel: meta.yLabel,
    xText: xText ?? (target.x !== undefined ? formatXValue(target.x, meta.xUnit) : meta.xLabel),
    seriesLabels: getSeriesLabels(meta),
    sectionStartText: target.sectionStartText ?? '',
    sectionEndText: target.sectionEndText ?? '',
    sectionRangeText: target.sectionRangeText ?? '',
    yStartText: target.yStartText ?? '',
    yEndText: target.yEndText ?? '',
    sectionDirection: target.sectionDirection,
    isMultiSeries: getSeriesLabels(meta).length >= 2,
  }
  const steps = getCoachingSteps(ruleName, labels)
  target.level1Question = steps[1].help
  target.level2Question = steps[2].help
  target.level3Hint = steps[3].help
  return target
}

function getSectionDirection(yStart, yEnd) {
  if (approxEqual(yStart, yEnd)) return 'constant'
  if (yEnd > yStart) return 'increase'
  return 'decrease'
}

function isDistanceSectionInterpretation(yLabel) {
  return yLabel?.trim() === '거리'
}

function isSpeedSectionInterpretation(yLabel) {
  return yLabel?.trim() === '속력'
}

function isHeightSectionInterpretation(yLabel) {
  return yLabel?.trim() === '높이'
}

const MOVEMENT_DIRECTION_KEYWORDS = ['이동', '움직', '나아', '다녀', '걸']

const SECTION_CONSTANT_SYNONYMS = [
  '변하지',
  '변함없',
  '유지',
  '유지되',
  '같',
  '그대로',
  '그대로이',
  '일정',
  '일정하',
  '변화가 없',
  '변화 없',
  '이동하지',
  '멈',
  '정지',
  '쉬',
]

function getSectionDirectionDetectionKeywords(yLabel, direction) {
  const constantKeywords = SECTION_CONSTANT_SYNONYMS
  const genericIncreaseKeywords = ['증가', '올라', '올랐', '상승', '커', '커졌', '늘', '늘었']
  const genericDecreaseKeywords = ['감소', '내려', '내렸', '하강', '작아', '작아졌', '줄', '줄었']
  const speedIncreaseKeywords = ['증가', '빨라', '빨라졌', '빨라지', '늘어남', '늘어났', '늘었', '늘']
  const speedDecreaseKeywords = ['감소', '느려', '느려졌', '느려지', '줄어', '줄어들', '줄었', '줄']
  const heightIncreaseKeywords = ['높아', '높아졌', '올라', '올라갔', '상승', '증가', '커', '커졌']
  const heightDecreaseKeywords = ['낮아', '낮아졌', '내려', '내려갔', '하강', '감소', '작아', '작아졌']

  if (direction === 'constant') {
    return constantKeywords
  }

  if (isDistanceSectionInterpretation(yLabel)) {
    if (direction === 'increase') {
      return [...MOVEMENT_DIRECTION_KEYWORDS, ...genericIncreaseKeywords, '높아', '높아졌', '낮아', '낮아졌']
    }

    return [...genericDecreaseKeywords, '낮아', '낮아졌']
  }

  if (isSpeedSectionInterpretation(yLabel)) {
    return direction === 'increase' ? speedIncreaseKeywords : speedDecreaseKeywords
  }

  if (isHeightSectionInterpretation(yLabel)) {
    return direction === 'increase' ? heightIncreaseKeywords : heightDecreaseKeywords
  }

  if (direction === 'increase') {
    return [...genericIncreaseKeywords, '높아', '높아졌']
  }

  return [...genericDecreaseKeywords, '낮아', '낮아졌']
}

function usesForbiddenMovementWording(yLabel, answer, direction = 'increase') {
  if (!isSpeedSectionInterpretation(yLabel) && !isHeightSectionInterpretation(yLabel)) {
    return false
  }

  const normalized = normalizeAnswer(answer)

  if (normalized.includes('이동하지')) {
    return false
  }

  if (
    direction === 'constant'
    && (normalized.includes('변화가없') || hasSectionDirectionKeyword(answer, ['변하지', '유지', '같', '그대로']))
  ) {
    return false
  }

  if (normalized.includes('이동')) {
    return true
  }

  return hasSectionDirectionKeyword(
    answer,
    MOVEMENT_DIRECTION_KEYWORDS.filter((keyword) => keyword !== '이동'),
  )
}

function hasSectionDirectionMismatch(answer, yLabel, direction) {
  return hasConflictingSectionDirection(answer, yLabel, direction)
}

function buildSectionDirectionMismatchCoaching(yLabel, sectionDirection, yStartText, yEndText) {
  const ySubject = withSubjectParticle(yLabel)

  if (isHeightSectionInterpretation(yLabel)) {
    if (sectionDirection === 'increase') {
      return `${yStartText}에서 ${yEndText}로 ${ySubject} 커졌습니다. 낮아졌다·하강했다보다 높아졌다, 올라갔다, 상승했다처럼 써 보세요.`
    }

    if (sectionDirection === 'decrease') {
      return `${yStartText}에서 ${yEndText}로 ${ySubject} 작아졌습니다. 높아졌다·상승했다보다 낮아졌다, 내려갔다, 하강했다처럼 써 보세요.`
    }
  }

  if (sectionDirection === 'increase') {
    return `${yStartText}에서 ${yEndText}로 ${ySubject} 커졌습니다. 증가했다, 올라갔다, 상승했다, 커졌다처럼 써 보세요.`
  }

  if (sectionDirection === 'decrease') {
    return `${yStartText}에서 ${yEndText}로 ${ySubject} 작아졌습니다. 감소했다, 내려갔다, 하강했다, 작아졌다처럼 써 보세요.`
  }

  return `${yStartText}부터 ${yEndText}까지 ${ySubject} 변하지 않았습니다. 변화가 없다, 이동하지 않았다처럼 써 보세요.`
}

function getSectionDirectionKeywords(yLabel, direction) {
  return getSectionDirectionDetectionKeywords(yLabel, direction)
}

function hasSectionDirectionKeyword(answer, keywords) {
  const normalized = normalizeAnswer(answer)
  return keywords.some((keyword) => normalized.includes(normalizeAnswer(keyword)))
}

function hasSectionDirectionSignal(answer, yLabel, direction) {
  return hasSectionDirectionKeyword(answer, getSectionDirectionDetectionKeywords(yLabel, direction))
}

function hasConflictingSectionDirection(answer, yLabel, direction) {
  if (direction === 'constant') {
    return false
  }

  const oppositeDirection = direction === 'increase' ? 'decrease' : 'increase'
  const oppositeKeywords = getSectionDirectionDetectionKeywords(yLabel, oppositeDirection)
  const expectedKeywords = getSectionDirectionDetectionKeywords(yLabel, direction)

  return (
    hasSectionDirectionKeyword(answer, oppositeKeywords)
    && !hasSectionDirectionKeyword(answer, expectedKeywords)
  )
}

/**
 * @param {number[]} studentNumbers
 * @param {CoachingTarget} target
 */
function assessSectionEndpointValues(studentNumbers, target) {
  const yStart = target.expectedNumbers?.[2]
  const yEnd = target.expectedNumbers?.[3] ?? target.sectionEndY

  const endpointNumbers = [yStart, yEnd].filter((value) => value !== undefined && value !== null)
  const matchedEndpointCount = countMatchedExpectedNumbers(studentNumbers, endpointNumbers)
  const hasYStart =
    yStart !== undefined
    && yStart !== null
    && studentNumbers.some((value) => valueMatchesExpectedNumber(value, yStart))
  const hasYEnd =
    yEnd !== undefined
    && yEnd !== null
    && studentNumbers.some((value) => valueMatchesExpectedNumber(value, yEnd))

  return {
    hasYStart,
    hasYEnd,
    matchedEndpointCount,
    bothEndpoints: hasYStart && hasYEnd,
    anyEndpoint: hasYStart || hasYEnd,
  }
}

function hasSectionRangeContext(answer, target) {
  return (
    (target.sectionStartText
      && normalizeAnswer(answer).includes(normalizeAnswer(target.sectionStartText)))
    || (target.sectionEndText
      && normalizeAnswer(answer).includes(normalizeAnswer(target.sectionEndText)))
    || (target.sectionRangeText
      && normalizeAnswer(answer).includes(normalizeAnswer(target.sectionRangeText)))
  )
}

function getSectionFocusedCoachingType(answer, target, quality, meta) {
  if (quality === 'complete' || quality === 'wrong') {
    return null
  }

  const studentNumbers = extractNumbers(answer)
  if (!studentNumbers.length || !hasStrictSectionYEndpoints(answer, target, meta)) {
    return null
  }

  const direction = target.sectionDirection ?? 'increase'
  const expectations = target.seriesSectionExpectations ?? []
  const directionMismatch = target.isMultiSeriesSection
    ? hasMultiSeriesSectionDirectionMismatch(answer, meta, expectations)
    : hasSectionDirectionMismatch(answer, meta.yLabel, direction)
  const hasDirection = target.isMultiSeriesSection
    ? hasMultiSeriesSectionDirectionSignal(answer, meta, expectations)
    : hasSectionDirectionSignal(answer, meta.yLabel, direction)

  if (
    directionMismatch
    || usesForbiddenMovementWording(meta.yLabel, answer, direction)
    || !hasDirection
  ) {
    return 'expression'
  }

  if (!hasRequiredSectionQuantityContext(answer, meta, target)) {
    return 'meaning'
  }

  return null
}

function buildSectionMeaningCoaching(meta, labels) {
  const { yLabel, yStartText = '', yEndText = '' } = labels
  const yUnit = meta.yUnit?.trim() ?? ''
  const unitHint = yUnit ? ` 또는 단위(${yUnit})` : ''

  if (yStartText && yEndText) {
    return `${yStartText}과 ${yEndText}의 숫자가 의미하는 것은 ${yLabel}입니다. ${yLabel}${unitHint}를 넣어 문장으로 써 보세요.`
  }

  return `그래프에서 읽은 숫자가 의미하는 것은 ${yLabel}입니다. ${yLabel}${unitHint}를 넣어 문장으로 써 보세요.`
}

function buildSectionExpressionCoaching(meta, answer, labels) {
  const { yLabel, sectionDirection = 'increase', yStartText = '', yEndText = '' } = labels

  if (hasSectionDirectionMismatch(answer, yLabel, sectionDirection) && yStartText && yEndText) {
    return buildSectionDirectionMismatchCoaching(yLabel, sectionDirection, yStartText, yEndText)
  }

  if (isHeightSectionInterpretation(yLabel)) {
    if (usesForbiddenMovementWording(yLabel, answer, sectionDirection)) {
      return `${yLabel}는 '이동'이 아니라 높이 변화를 나타내는 말로 써 보세요.\n높아졌다, 올라갔다, 상승했다 / 낮아졌다, 내려갔다, 하강했다처럼 표현해 보세요.`
    }

    if (!hasSectionDirectionSignal(answer, yLabel, sectionDirection)) {
      if (sectionDirection === 'increase') {
        return `${yLabel}에 맞는 표현을 생각해 보세요.\n높아졌다, 올라갔다, 상승했다처럼 써 보세요.`
      }

      if (sectionDirection === 'decrease') {
        return `${yLabel}에 맞는 표현을 생각해 보세요.\n낮아졌다, 내려갔다, 하강했다처럼 써 보세요.`
      }

      if (sectionDirection === 'constant') {
        return `${yLabel}에 맞는 표현을 생각해 보세요.\n변화가 없다, 이동하지 않았다처럼 써 보세요.`
      }
    }
  }

  if (isSpeedSectionInterpretation(yLabel)) {
    if (usesForbiddenMovementWording(yLabel, answer, sectionDirection)) {
      return `${yLabel}는 '이동'이 아니라 속력 변화를 나타내는 말로 써 보세요.\n증가했다, 빨라졌다, 늘어났다 / 감소했다, 느려졌다, 줄어들었다처럼 표현해 보세요.`
    }

    if (!hasSectionDirectionSignal(answer, yLabel, sectionDirection)) {
      if (sectionDirection === 'increase') {
        return `${yLabel}에 맞는 표현을 생각해 보세요.\n증가했다, 빨라졌다, 늘어났다처럼 써 보세요.`
      }

      return `${yLabel}에 맞는 표현을 생각해 보세요.\n감소했다, 느려졌다, 줄어들었다처럼 써 보세요.`
    }
  }

  if (isDistanceSectionInterpretation(yLabel) && !hasSectionDirectionSignal(answer, yLabel, sectionDirection)) {
    return `${yLabel} 변화를 나타낼 때 '이동'처럼 써 보세요.\n${labels.yStartText}에서 ${labels.yEndText}로 어떻게 변했는지 문장으로 써 보세요.`
  }

  return getCoachingHelp('section_interpretation', 3, labels)
}

function buildSectionChangePhrase(yLabel, yStart, yEnd, yUnit, direction) {
  const yStartText = formatYValue(yStart, yUnit)
  const yEndText = formatYValue(yEnd, yUnit)

  if (direction === 'constant') {
    return `${withTopicParticle(yLabel)} ${yStartText}로 변하지 않았습니다`
  }

  if (isDistanceSectionInterpretation(yLabel)) {
    return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 이동했습니다`
  }

  if (isSpeedSectionInterpretation(yLabel)) {
    if (direction === 'increase') {
      return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 증가했습니다`
    }

    return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 감소했습니다`
  }

  if (isHeightSectionInterpretation(yLabel)) {
    if (direction === 'increase') {
      return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 높아졌습니다`
    }

    return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 낮아졌습니다`
  }

  if (direction === 'increase') {
    return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 증가했습니다`
  }

  return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 감소했습니다`
}

function buildSingleSeriesSectionReferenceAnswer(
  xStart,
  xEnd,
  yStart,
  yEnd,
  yLabel,
  xUnit,
  yUnit,
  rangePhrase,
) {
  const startText = formatXValue(xStart, xUnit)
  const endText = formatXValue(xEnd, xUnit)
  const direction = getSectionDirection(yStart, yEnd)

  if (direction === 'constant') {
    return wrapGraphConfirmation(
      `${startText}부터 ${endText}까지 ${buildSectionChangePhrase(yLabel, yStart, yEnd, yUnit, direction)}.`,
    )
  }

  return wrapGraphConfirmation(
    `${startText}부터 ${endText}까지 ${buildSectionChangePhrase(yLabel, yStart, yEnd, yUnit, direction)}.`,
  )
}

function buildMultiSeriesSectionReferenceAnswer(meta, section, xUnit, yUnit, yLabel, primaryDirection) {
  const sectionStartText = formatXValue(section.xStart, xUnit)
  const sectionEndText = formatXValue(section.xEnd, xUnit)
  const seriesLabels = getSeriesLabels(meta)
  const stepLabels = {
    xLabel: meta.xLabel,
    yLabel,
    sectionStartText,
    sectionEndText,
    seriesLabels,
    sectionDirection: primaryDirection,
    isMultiSeries: true,
  }

  const step1 = getCoachingHelp('section_interpretation', 1, stepLabels)
  const step2 = getCoachingHelp('section_interpretation', 2, stepLabels)
  const step3 = getCoachingHelp('section_interpretation', 3, stepLabels)

  const exampleLines = meta.series
    .filter((entry) => entry.label && entry.points.length)
    .map((entry) => {
      const yStart = findYAtX(entry.points, section.xStart)
      const yEnd = findYAtX(entry.points, section.xEnd)
      if (yStart === null || yEnd === null) return null

      const direction = getSectionDirection(yStart, yEnd)
      const startValueText = formatYValue(yStart, yUnit)
      const endValueText = formatYValue(yEnd, yUnit)

      if (direction === 'constant') {
        return `- ${formatSubjectPossessive(entry.label)} ${withTopicParticle(yLabel)} ${startValueText}로 변하지 않았습니다.`
      }

      if (isDistanceSectionInterpretation(yLabel)) {
        return `- ${formatSubjectPossessive(entry.label)} ${withTopicParticle(yLabel)} ${startValueText}에서 ${endValueText}로 이동했습니다.`
      }

      return `- ${formatSubjectPossessive(entry.label)} ${buildSectionChangePhrase(yLabel, yStart, yEnd, yUnit, direction).replace(/\.$/, '')}.`
    })
    .filter(Boolean)

  return [
    '다음 순서로 각각 설명해 보세요.',
    '',
    `1. ${step1.replace(/\n/g, ' ')}`,
    `2. ${step2.replace(/\n/g, ' ')}`,
    `3. ${step3.replace(/\n/g, ' ')}`,
    '',
    '예시:',
    ...exampleLines,
  ].join('\n')
}

function buildMultiSeriesSectionSeparateWritingCoaching(meta, labels) {
  const subjectsWithI = formatSeriesNamesWithI(getSeriesLabels(meta))
  const { sectionStartText = '', sectionEndText = '' } = labels

  return `${sectionStartText}과 ${sectionEndText}에 ${subjectsWithI} ${withTopicParticle(meta.yLabel)} 각각 얼마인지, 사람마다 따로 문장으로 써 보세요.`
}

/**
 * @param {ReturnType<typeof buildCoachingContext>} context
 * @param {Record<string, string>} problem
 * @returns {CoachingTarget}
 */
function resolveCoachingTarget(context, problem) {
  const meta = getProblemMeta(problem)
  const { xLabel, yLabel, xUnit, yUnit, primaryPoints } = meta
  const ruleName = context.ruleName
  const questionText = context.question

  if (ruleName === 'relation_check') {
    return finalizeCoachingTarget(
      {
        expectedTexts: [xLabel, yLabel],
        referenceAnswer: wrapGraphConfirmation(
          `이 그래프는 ${xLabel}에 따른 ${yLabel}의 변화를 나타냅니다.`,
        ),
      },
      ruleName,
      meta,
      xLabel,
    )
  }

  if (ruleName === 'section_interpretation' && context.section) {
    const section = context.section
    const rangePhrase = buildSectionRangePhrase(problem, section.xStart, section.xEnd)
    const sectionStartText = formatXValue(section.xStart, xUnit)
    const sectionEndText = formatXValue(section.xEnd, xUnit)
    const isMultiSeries = Boolean(section.isMultiSeries) || isMultiSeriesGraph(meta)
    const primaryDirection = getSectionDirection(section.yStart, section.yEnd)
    const referenceAnswer = isMultiSeries
      ? buildMultiSeriesSectionReferenceAnswer(
          meta,
          section,
          xUnit,
          yUnit,
          yLabel,
          primaryDirection,
        )
      : buildSingleSeriesSectionReferenceAnswer(
          section.xStart,
          section.xEnd,
          section.yStart,
          section.yEnd,
          yLabel,
          xUnit,
          yUnit,
          rangePhrase,
        )
    const seriesSectionExpectations = isMultiSeries
      ? buildSeriesSectionExpectations(meta, section.xStart, section.xEnd)
      : []

    return finalizeCoachingTarget(
      {
        x: section.xStart,
        y: section.yStart,
        expectedNumbers: [section.xStart, section.xEnd, section.yStart, section.yEnd],
        expectedTexts: getSectionDirectionKeywords(yLabel, primaryDirection),
        referenceAnswer,
        sectionStartText,
        sectionEndText,
        sectionRangeText: rangePhrase,
        sectionEndY: section.yEnd,
        yStartText: formatYValue(section.yStart, yUnit),
        yEndText: formatYValue(section.yEnd, yUnit),
        sectionDirection: primaryDirection,
        isMultiSeriesSection: isMultiSeries,
        seriesSectionExpectations,
      },
      ruleName,
      meta,
      sectionStartText,
    )
  }

  if (ruleName === 'point_value') {
    const x = extractXFromQuestion(questionText, xUnit) ?? pickRepresentativeX(primaryPoints.map((point) => point.x))
    const xText = x !== null ? formatXValue(x, xUnit) : `특정 ${xLabel}`
    const valuesAtX = x !== null ? getLabeledSeriesValuesAtX(meta, x) : []
    const y = x !== null ? findYAtX(primaryPoints, x) : null
    const yText = y !== null ? formatYValue(y, yUnit) : yLabel
    const referenceAnswer =
      valuesAtX.length >= 2
        ? buildPointValueReferenceAnswer(xText, yLabel, yText, questionText, yUnit, valuesAtX)
        : y !== null && x !== null
          ? buildPointValueReferenceAnswer(xText, yLabel, yText, questionText, yUnit)
          : `그래프에서 ${xText}에 해당하는 ${withObjectParticle(yLabel)} 읽어 보세요.`

    return finalizeCoachingTarget(
      {
        x: x ?? undefined,
        y: y ?? undefined,
        expectedNumbers:
          valuesAtX.length >= 2 ? valuesAtX.map((entry) => entry.y) : y !== null ? [y] : [],
        referenceAnswer,
      },
      ruleName,
      meta,
      xText,
    )
  }

  if (ruleName === 'final_value') {
    const endX = isMultiSeriesGraph(meta) ? getComparisonEndX(meta) : primaryPoints[primaryPoints.length - 1]?.x
    const xText = endX !== null && endX !== undefined ? formatXValue(endX, xUnit) : `마지막 ${xLabel}`
    const valuesAtEnd = endX !== null && endX !== undefined ? getLabeledSeriesValuesAtX(meta, endX) : []
    const lastPoint = primaryPoints[primaryPoints.length - 1]
    const yText = lastPoint ? formatYValue(lastPoint.y, yUnit) : yLabel

    const referenceAnswer =
      valuesAtEnd.length >= 2
        ? buildComparisonFinalReferenceAnswer(xText, yLabel, yUnit, valuesAtEnd)
        : wrapGraphConfirmation(`최종 ${withTopicParticle(yLabel)} ${yText}입니다.`)

    return finalizeCoachingTarget(
      {
        x: endX ?? lastPoint?.x,
        y: lastPoint?.y,
        expectedNumbers:
          valuesAtEnd.length >= 2
            ? valuesAtEnd.map((entry) => entry.y)
            : lastPoint
              ? [lastPoint.y]
              : [],
        referenceAnswer,
      },
      ruleName,
      meta,
      xText,
    )
  }

  if (ruleName === 'constant_section' || ruleName === 'stop_section') {
    const section = findConstantSections(primaryPoints)[0]
    const referenceAnswer = section
      ? wrapGraphConfirmation(
          `${formatXValue(section.xStart, xUnit)}부터 ${formatXValue(section.xEnd, xUnit)}까지 ${withSubjectParticle(yLabel)} ${formatYValue(section.y, yUnit)}로 변하지 않았습니다.`,
        )
      : `${withSubjectParticle(yLabel)} 변하지 않는 구간을 그래프에서 찾아 보세요.`

    return finalizeCoachingTarget(
      {
        expectedNumbers: section ? [section.xStart, section.xEnd, section.y] : [],
        expectedTexts: section
          ? [formatXValue(section.xStart, xUnit), formatXValue(section.xEnd, xUnit)]
          : ['구간', '변하지'],
        referenceAnswer,
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'max_value' || ruleName === 'max_value_section') {
    const maxPoint = findExtremePoints(primaryPoints, 'max')
    const referenceAnswer = maxPoint
      ? wrapGraphConfirmation(`가장 큰 ${withTopicParticle(yLabel)} ${formatYValue(maxPoint.y, yUnit)}입니다.`)
      : `그래프에서 가장 높은 점의 ${withObjectParticle(yLabel)} 읽어 보세요.`

    return finalizeCoachingTarget(
      {
        x: maxPoint?.x,
        y: maxPoint?.y,
        expectedNumbers: maxPoint ? [maxPoint.y] : [],
        referenceAnswer,
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'max_min_value') {
    const maxPoint = findExtremePoints(primaryPoints, 'max')
    const minPoint = findExtremePoints(primaryPoints, 'min')
    const referenceAnswer =
      maxPoint && minPoint
        ? wrapGraphConfirmation(
            `가장 큰 ${withTopicParticle(yLabel)} ${formatYValue(maxPoint.y, yUnit)}, 가장 작은 ${withTopicParticle(yLabel)} ${formatYValue(minPoint.y, yUnit)}입니다.`,
          )
        : `그래프에서 가장 큰 값과 가장 작은 값을 각각 읽어 보세요.`

    return finalizeCoachingTarget(
      {
        expectedNumbers: [maxPoint?.y, minPoint?.y].filter((value) => value !== undefined),
        referenceAnswer,
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'value_compare' || ruleName === 'compare_value') {
    const x = extractXFromQuestion(questionText, xUnit) ?? pickRepresentativeX(primaryPoints.map((point) => point.x))
    const xText = x !== null ? formatXValue(x, xUnit) : `같은 ${xLabel}`
    const valuesAtX = meta.series
      .map((entry) => ({
        label: entry.label,
        y: x !== null ? findYAtX(entry.points, x) : null,
      }))
      .filter((entry) => entry.y !== null)

    const referenceAnswer =
      valuesAtX.length >= 2
        ? buildMultiSeriesYAnswer(
            buildTimePhraseForAnswer(xText, questionText),
            yLabel,
            yUnit,
            valuesAtX,
          )
        : `${xText}에서 두 대상의 ${withObjectParticle(yLabel)} 각각 읽어 비교해 보세요.`

    return finalizeCoachingTarget(
      {
        x: x ?? undefined,
        expectedNumbers: valuesAtX.map((entry) => entry.y),
        referenceAnswer,
      },
      ruleName,
      meta,
      xText,
    )
  }

  if (ruleName === 'intersection_point') {
    const [firstSeries, secondSeries] = meta.series
    let intersection = null

    if (firstSeries?.points.length && secondSeries?.points.length) {
      for (const point of firstSeries.points) {
        if (approxEqual(point.x, 0) && approxEqual(point.y, 0)) continue

        const y2 = findYAtX(secondSeries.points, point.x)
        if (y2 !== null && approxEqual(point.y, y2)) {
          intersection = { x: point.x, y: point.y }
          break
        }
      }
    }

    const referenceAnswer = intersection
      ? wrapGraphConfirmation(
          `두 사람이 만날 때는 ${formatXValue(intersection.x, xUnit)}이고, 이동 ${withTopicParticle('거리')} ${formatYValue(intersection.y, yUnit)}입니다.`,
        )
      : `두 그래프가 만나는 점의 ${xLabel}과 ${withObjectParticle(yLabel)} 함께 읽어 보세요.`

    return finalizeCoachingTarget(
      {
        x: intersection?.x,
        y: intersection?.y,
        expectedNumbers: intersection ? [intersection.x, intersection.y] : [],
        referenceAnswer,
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'trend_direction' || ruleName === 'trend_fact') {
    const first = primaryPoints[0]
    const last = primaryPoints[primaryPoints.length - 1]
    let direction = '변화'

    if (first && last) {
      if (last.y > first.y) direction = '증가'
      else if (last.y < first.y) direction = '감소'
      else direction = '거의 변하지 않음'
    }

    const referenceAnswer =
      first && last
        ? wrapGraphConfirmation(
            `${withSubjectParticle(xLabel)} 지날수록 ${withSubjectParticle(yLabel)} ${direction}하는 경향을 보입니다.`,
          )
        : `그래프의 처음과 끝 ${withObjectParticle(yLabel)} 비교해 보세요.`

    return finalizeCoachingTarget(
      {
        expectedTexts: [direction, yLabel],
        referenceAnswer,
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'repeat_pattern') {
    return finalizeCoachingTarget(
      {
        expectedTexts: ['반복', '같은'],
        referenceAnswer: wrapGraphConfirmation(`${yLabel}의 변화가 일정한 패턴으로 반복됩니다.`),
      },
      ruleName,
      meta,
    )
  }

  if (ruleName === 'summary' || ruleName === 'insight_summary' || ruleName === 'feature_summary') {
    return finalizeCoachingTarget(
      {
        expectedTexts: [yLabel, xLabel],
        referenceAnswer: wrapGraphConfirmation(
          `${withSubjectParticle(xLabel)} 지날수록 ${withSubjectParticle(yLabel)} 어떻게 변하는지 그래프 전체를 설명해 보세요.`,
        ),
      },
      ruleName,
      meta,
    )
  }

  const fallbackX = pickRepresentativeX(primaryPoints.map((point) => point.x))
  const fallbackY = fallbackX !== null ? findYAtX(primaryPoints, fallbackX) : null
  const xText = fallbackX !== null ? formatXValue(fallbackX, xUnit) : xLabel

  const fallbackValuesAtX = fallbackX !== null ? getLabeledSeriesValuesAtX(meta, fallbackX) : []
  const fallbackReferenceAnswer =
    fallbackValuesAtX.length >= 2
      ? buildPointValueReferenceAnswer(xText, yLabel, '', context.question, yUnit, fallbackValuesAtX)
      : fallbackY !== null
        ? buildPointValueReferenceAnswer(
            xText,
            yLabel,
            formatYValue(fallbackY, yUnit),
            context.question,
            yUnit,
          )
        : `그래프를 보며 ${context.question}`

  return finalizeCoachingTarget(
    {
      x: fallbackX ?? undefined,
      y: fallbackY ?? undefined,
      expectedNumbers:
        fallbackValuesAtX.length >= 2
          ? fallbackValuesAtX.map((entry) => entry.y)
          : fallbackY !== null
            ? [fallbackY]
            : [],
      referenceAnswer: fallbackReferenceAnswer,
    },
    ruleName,
    meta,
    xText,
  )
}

/**
 * @typedef {'complete' | 'close' | 'numbers_only' | 'wrong' | 'partial' | 'give_up'} AnswerQuality
 */

function hasYUnitInAnswer(answer, yUnit) {
  if (!yUnit) return false
  return normalizeAnswer(answer).includes(normalizeAnswer(yUnit))
}

function extractNumberUnitTokens(answer) {
  const normalized = normalizeAnswer(answer)
  const tokens = []
  const regex = /\d+\.?\d*(km\/m|km|cm|ppm|℃|m\/s|w|도|m)/gi
  let match = regex.exec(normalized)

  while (match) {
    const suffix = match[1].toLowerCase()
    let unit = suffix

    if (suffix === '도') {
      unit = '℃'
    } else if (suffix === 'w') {
      unit = 'W'
    }

    tokens.push({ text: match[0], unit })
    match = regex.exec(normalized)
  }

  return tokens
}

function unitMatchesExpected(tokenUnit, expectedYUnit) {
  if (!expectedYUnit) return false

  if (expectedYUnit === '℃') {
    return tokenUnit === '℃'
  }

  return tokenUnit.toLowerCase() === expectedYUnit.toLowerCase()
}

function hasWordOnlyCorrectUnit(answer, yUnit) {
  if (!yUnit) return false

  const normalized = normalizeAnswer(answer)

  switch (yUnit) {
    case 'km':
      return normalized.includes('킬로')
    case 'W':
      return normalized.includes('와트')
    case 'cm':
      return normalized.includes('센티')
    case 'm':
      return normalized.includes('미터') && !normalized.includes('킬로')
    default:
      return normalized.includes(normalizeAnswer(yUnit))
  }
}

function hasCorrectYUnitInAnswer(answer, yUnit) {
  if (!yUnit) return false

  const tokens = extractNumberUnitTokens(answer)

  if (tokens.length > 0) {
    return tokens.every((token) => unitMatchesExpected(token.unit, yUnit))
  }

  return hasWordOnlyCorrectUnit(answer, yUnit)
}

function hasInvalidQuantityUnits(answer, yUnit) {
  if (!yUnit || !answer.trim()) return false

  const tokens = extractNumberUnitTokens(answer)
  if (tokens.length === 0) return false

  return tokens.some((token) => !unitMatchesExpected(token.unit, yUnit))
}

function hasExplicitWrongYUnit(answer, yUnit) {
  return hasInvalidQuantityUnits(answer, yUnit)
}

function hasRequiredQuantityContext(answer, meta) {
  return includesLabel(answer, meta.yLabel) || hasCorrectYUnitInAnswer(answer, meta.yUnit)
}

function capSectionQualityWithoutQuantityContext(quality, answer, meta) {
  if (quality === 'wrong' || quality === 'partial') {
    return quality
  }

  if (hasExplicitWrongYUnit(answer, meta.yUnit)) {
    return includesLabel(answer, meta.yLabel) ? 'partial' : 'wrong'
  }

  if (!hasRequiredQuantityContext(answer, meta)) {
    return 'partial'
  }

  return quality
}

function hasXContextInAnswer(answer, x, xUnit, xLabel) {
  if (x !== undefined && xUnit) {
    const xText = formatXValue(x, xUnit)
    if (normalizeAnswer(answer).includes(normalizeAnswer(xText))) return true
  }

  if (includesLabel(answer, xLabel)) return true

  if (x !== undefined) {
    return extractNumbers(answer).some((value) => approxEqual(value, x))
  }

  return false
}

function isFullSentenceAnswer(answer, yLabel, yUnit) {
  const trimmed = answer.trim()
  if (trimmed.length < 10) return false

  const hasEnding = /(입니다|이에요|예요|다\.|요\.)/.test(trimmed)
  const hasLabel = includesLabel(trimmed, yLabel)
  const hasUnit = hasYUnitInAnswer(trimmed, yUnit)

  return hasEnding && (hasLabel || hasUnit)
}

const VALUE_MATCH_TOLERANCE = 0.2

function valueMatchesExpectedNumber(value, expected) {
  return Math.abs(value - expected) <= VALUE_MATCH_TOLERANCE
}

function valueMatchesSectionExpectedNumber(value, expected) {
  return approxEqual(value, expected)
}

function getSectionYEndpointNumbers(target) {
  const yStart = target.expectedNumbers?.[2]
  const yEnd = target.expectedNumbers?.[3] ?? target.sectionEndY

  return [yStart, yEnd].filter((value) => value !== undefined && value !== null)
}

/**
 * @param {number[]} studentNumbers
 * @param {CoachingTarget} target
 */
function assessStrictSectionYEndpoints(studentNumbers, target) {
  const [yStart, yEnd] = getSectionYEndpointNumbers(target)
  const hasYStart =
    yStart !== undefined
    && studentNumbers.some((value) => valueMatchesSectionExpectedNumber(value, yStart))
  const hasYEnd =
    yEnd !== undefined
    && studentNumbers.some((value) => valueMatchesSectionExpectedNumber(value, yEnd))

  return {
    hasYStart,
    hasYEnd,
    bothEndpoints: hasYStart && hasYEnd,
    anyEndpoint: hasYStart || hasYEnd,
  }
}

function buildSeriesSectionExpectations(meta, xStart, xEnd) {
  if (xStart === undefined || xEnd === undefined) {
    return []
  }

  return meta.series
    .filter((entry) => entry.label && entry.points.length)
    .map((entry) => {
      const yStart = findYAtX(entry.points, xStart)
      const yEnd = findYAtX(entry.points, xEnd)

      if (yStart === null || yEnd === null) {
        return null
      }

      return {
        label: entry.label,
        yStart,
        yEnd,
        direction: getSectionDirection(yStart, yEnd),
      }
    })
    .filter(Boolean)
}

function getSectionExpectedValues(target, meta) {
  const xStart = target.expectedNumbers?.[0]
  const xEnd = target.expectedNumbers?.[1]
  const values = []

  if (xStart !== undefined && xStart !== null) {
    values.push(xStart)
  }

  if (xEnd !== undefined && xEnd !== null) {
    values.push(xEnd)
  }

  if (target.isMultiSeriesSection && meta) {
    buildSeriesSectionExpectations(meta, xStart, xEnd).forEach((expectation) => {
      values.push(expectation.yStart, expectation.yEnd)
    })
  } else {
    const yStart = target.expectedNumbers?.[2]
    const yEnd = target.expectedNumbers?.[3] ?? target.sectionEndY

    if (yStart !== undefined && yStart !== null) {
      values.push(yStart)
    }

    if (yEnd !== undefined && yEnd !== null) {
      values.push(yEnd)
    }
  }

  return values
}

function getLabelScopedSegments(answer, labels) {
  const normalized = normalizeAnswer(answer)
  const positions = labels
    .map((label) => ({ label, index: normalized.indexOf(normalizeAnswer(label)) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)

  /** @type {Map<string, string>} */
  const segments = new Map()

  positions.forEach((entry, index) => {
    const end = index + 1 < positions.length ? positions[index + 1].index : normalized.length
    segments.set(entry.label, normalized.slice(entry.index, end))
  })

  return segments
}

function segmentHasEndpointValue(segment, expected) {
  return extractNumbers(segment).some((value) => valueMatchesSectionExpectedNumber(value, expected))
}

function segmentHasInvalidEndpointValues(segment, allowedValues) {
  const segmentNumbers = extractNumbers(segment)
  if (!segmentNumbers.length) {
    return false
  }

  return segmentNumbers.some(
    (value) =>
      !allowedValues.some((expected) => valueMatchesSectionExpectedNumber(value, expected)),
  )
}

function assessMultiSeriesSectionYEndpoints(answer, target) {
  const expectations = target.seriesSectionExpectations ?? []
  const segments = getLabelScopedSegments(
    answer,
    expectations.map((expectation) => expectation.label),
  )

  const seriesResults = expectations.map((expectation) => {
    const segment = segments.get(expectation.label) ?? ''
    const hasLabel = segment.length > 0
    const allowedValues = [expectation.yStart, expectation.yEnd]
    const hasYStart = hasLabel && segmentHasEndpointValue(segment, expectation.yStart)
    const hasYEnd = hasLabel && segmentHasEndpointValue(segment, expectation.yEnd)
    const hasWrongNumbersInSegment =
      hasLabel && segmentHasInvalidEndpointValues(segment, allowedValues)

    return {
      ...expectation,
      hasLabel,
      hasYStart,
      hasYEnd,
      hasWrongNumbersInSegment,
      bothEndpoints: hasLabel && hasYStart && hasYEnd && !hasWrongNumbersInSegment,
    }
  })

  return {
    seriesResults,
    bothEndpoints: seriesResults.length > 0 && seriesResults.every((result) => result.bothEndpoints),
    anyEndpoint: seriesResults.some((result) => result.hasYStart || result.hasYEnd),
    hasWrongPairing: seriesResults.some((result) => result.hasWrongNumbersInSegment),
  }
}

function hasMultiSeriesSectionWrongPairing(answer, target) {
  if (!target.isMultiSeriesSection) {
    return false
  }

  return assessMultiSeriesSectionYEndpoints(answer, target).hasWrongPairing
}

function hasStrictInvalidSectionNumbers(answer, target, meta) {
  const studentNumbers = extractNumbers(answer)
  if (!studentNumbers.length) {
    return false
  }

  const allowedValues = getSectionExpectedValues(target, meta)
  return studentNumbers.some(
    (value) =>
      !allowedValues.some((expected) => valueMatchesSectionExpectedNumber(value, expected)),
  )
}

function hasStrictSectionYEndpoints(answer, target, meta) {
  const studentNumbers = extractNumbers(answer)
  if (!studentNumbers.length) {
    return false
  }

  if (hasStrictInvalidSectionNumbers(answer, target, meta)) {
    return false
  }

  if (target.isMultiSeriesSection) {
    return assessMultiSeriesSectionYEndpoints(answer, target).bothEndpoints
  }

  return assessStrictSectionYEndpoints(studentNumbers, target).bothEndpoints
}

function assessStrictSectionEndpoints(answer, target, meta) {
  if (target.isMultiSeriesSection) {
    return assessMultiSeriesSectionYEndpoints(answer, target)
  }

  return assessStrictSectionYEndpoints(extractNumbers(answer), target)
}

function includesSeriesLabel(answer, label) {
  return includesLabel(answer, label)
}

function hasMultiSeriesSectionQuantityContext(answer, meta) {
  const seriesLabels = getSeriesLabels(meta)
  return seriesLabels.length >= 2 && seriesLabels.every((label) => includesSeriesLabel(answer, label))
}

function hasMultiSeriesSectionDirectionSignal(answer, meta, expectations) {
  const segments = getLabelScopedSegments(
    answer,
    expectations.map((expectation) => expectation.label),
  )

  return expectations.every((expectation) => {
    const segment = segments.get(expectation.label) ?? ''
    if (!segment) {
      return false
    }

    return hasSectionDirectionSignal(segment, meta.yLabel, expectation.direction)
  })
}

function hasMultiSeriesSectionDirectionMismatch(answer, meta, expectations) {
  const segments = getLabelScopedSegments(
    answer,
    expectations.map((expectation) => expectation.label),
  )

  return expectations.some((expectation) => {
    const segment = segments.get(expectation.label) ?? ''
    if (!segment) {
      return false
    }

    return hasSectionDirectionMismatch(segment, meta.yLabel, expectation.direction)
  })
}

function hasRequiredSectionQuantityContext(answer, meta, target) {
  if (includesLabel(answer, meta.yLabel) || hasCorrectYUnitInAnswer(answer, meta.yUnit)) {
    return true
  }

  if (target.isMultiSeriesSection) {
    return hasMultiSeriesSectionQuantityContext(answer, meta)
  }

  return false
}

function isValueAllowedInSectionAnswer(value, target, meta) {
  return getSectionExpectedValues(target, meta).some((expected) =>
    valueMatchesSectionExpectedNumber(value, expected),
  )
}

function hasUnexpectedSectionNumbers(answer, target, meta) {
  const studentNumbers = extractNumbers(answer)
  if (!studentNumbers.length) {
    return false
  }

  return studentNumbers.some((value) => !isValueAllowedInSectionAnswer(value, target, meta))
}

function hasExactSectionEndpointValues(answer, target, meta) {
  return assessSectionEndpointValues(extractNumbers(answer), target).bothEndpoints
    && !hasUnexpectedSectionNumbers(answer, target, meta)
}

/**
 * @param {number[]} studentNumbers
 * @param {number[]} expectedNumbers
 */
function countMatchedExpectedNumbers(studentNumbers, expectedNumbers) {
  return expectedNumbers.filter((expected) =>
    studentNumbers.some((value) => valueMatchesExpectedNumber(value, expected)),
  ).length
}

/**
 * @param {string} answer
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 */
function classifyPointValueQuality(answer, target, meta) {
  const expectedNumbers =
    target.expectedNumbers?.length
      ? target.expectedNumbers
      : target.y !== undefined
        ? [target.y]
        : []
  const expectedX = target.x
  const studentNumbers = extractNumbers(answer)
  const hasXContext = hasXContextInAnswer(answer, expectedX, meta.xUnit, meta.xLabel)
  const matchedYCount = countMatchedExpectedNumbers(studentNumbers, expectedNumbers)
  const allYMatched = expectedNumbers.length > 0 && matchedYCount === expectedNumbers.length

  const valuesAtX = expectedX !== undefined ? getLabeledSeriesValuesAtX(meta, expectedX) : []
  const isMultiSeries = valuesAtX.length >= 2

  if (isMultiSeries && allYMatched) {
    return 'complete'
  }

  if (!isMultiSeries && expectedNumbers.length === 1 && matchedYCount === 1) {
    if (isFullSentenceAnswer(answer, meta.yLabel, meta.yUnit) && hasXContext) return 'complete'
    if (hasXContext) return 'close'
    return 'partial'
  }

  if (isMultiSeries) {
    const labeledMatches = valuesAtX.filter(
      (entry) =>
        includesLabel(answer, entry.label)
        && studentNumbers.some((value) => Math.abs(value - entry.y) <= VALUE_MATCH_TOLERANCE),
    )

    if (labeledMatches.length >= 1 && matchedYCount < expectedNumbers.length) {
      return 'close'
    }

    if (hasXContext && matchedYCount >= 1 && matchedYCount < expectedNumbers.length) {
      return 'close'
    }

    if (matchedYCount === 1 && !hasXContext) {
      return 'partial'
    }

    if (matchedYCount >= 1 && matchedYCount < expectedNumbers.length) {
      return 'close'
    }

    if (hasXContext && matchedYCount === 0) {
      return 'partial'
    }
  }

  if (hasXContext && matchedYCount === 0) {
    return 'partial'
  }

  if (matchedYCount >= 1 && !hasXContext) {
    return 'partial'
  }

  if (hasXContext && matchedYCount >= 1) {
    return 'close'
  }

  if (!studentNumbers.length && hasXContext) {
    return 'partial'
  }

  return 'wrong'
}

/**
 * @param {string} answer
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 */
function isPointValueXOnlyPartial(answer, target, meta) {
  const expectedNumbers =
    target.expectedNumbers?.length
      ? target.expectedNumbers
      : target.y !== undefined
        ? [target.y]
        : []
  const studentNumbers = extractNumbers(answer)
  const hasXContext = hasXContextInAnswer(answer, target.x, meta.xUnit, meta.xLabel)
  const matchedYCount = countMatchedExpectedNumbers(studentNumbers, expectedNumbers)

  return hasXContext && matchedYCount === 0
}

/**
 * @param {AnswerQuality} quality
 * @param {string} ruleName
 * @param {number} nextLevel
 * @param {string} answer
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 */
function resolveCoachingStepLevel(quality, ruleName, nextLevel, answer, target, meta) {
  if (ruleName === 'point_value' && isMultiSeriesGraph(meta)) {
    if (quality === 'partial' && isPointValueXOnlyPartial(answer, target, meta)) {
      return Math.max(nextLevel, 2)
    }

    if ((quality === 'partial' || quality === 'close') && hasPartialSeriesValues(answer, target, meta)) {
      return Math.max(nextLevel, 2)
    }
  }

  if (ruleName === 'point_value' && quality === 'partial' && isPointValueXOnlyPartial(answer, target, meta)) {
    return Math.max(nextLevel, 2)
  }

  if (
    ruleName === 'section_interpretation'
    && getSectionFocusedCoachingType(answer, target, quality, meta)
  ) {
    return 3
  }

  return nextLevel
}

/**
 * @param {ReturnType<typeof getSeriesValueMatchStatus>} seriesStatus
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @param {string} xText
 */
function buildMissingSeriesCoaching(seriesStatus, meta, xText) {
  const missingEntry = seriesStatus.missing[0]

  if (!missingEntry) return null

  return `${xText}에 해당하는 ${formatSubjectPossessive(missingEntry.label)} ${withTopicParticle(meta.yLabel)} 얼마인가요?`
}

/**
 * @param {AnswerQuality} quality
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @param {number} hintLevel
 * @param {string} studentAnswer
 * @param {string} ruleName
 * @param {ReturnType<typeof buildCoachingContext>} context
 */
function buildCoachingResponseFromQuality(
  quality,
  target,
  meta,
  hintLevel,
  studentAnswer,
  ruleName,
  context,
) {
  const nextLevel = Math.min(Math.max(hintLevel, 0) + 1, 3)
  const stepLevel = resolveCoachingStepLevel(quality, ruleName, nextLevel, studentAnswer, target, meta)
  const labels = getStepLabels(meta, target, context)
  const xText = labels.xText

  if (quality === 'complete' || (ruleName === 'section_interpretation' && quality === 'close')) {
    return {
      help: '잘 작성했습니다. 다음 질문으로 이동해도 좋습니다.',
      hintLevel: stepLevel,
      showAnswer: false,
      isComplete: true,
    }
  }

  let help = getCoachingHelp(ruleName, stepLevel, labels)

  const focusedCoachingType =
    ruleName === 'section_interpretation'
      ? getSectionFocusedCoachingType(studentAnswer, target, quality, meta)
      : null

  if (focusedCoachingType === 'expression') {
    help = buildSectionExpressionCoaching(meta, studentAnswer, labels)
  } else if (focusedCoachingType === 'meaning') {
    help = buildSectionMeaningCoaching(meta, labels)
  }

  if (
    ruleName === 'section_interpretation'
    && target.isMultiSeriesSection
    && (quality === 'partial' || quality === 'wrong')
    && stepLevel >= 3
    && hasMultiSeriesSectionQuantityContext(studentAnswer, meta)
    && !hasStrictSectionYEndpoints(studentAnswer, target, meta)
    && !hasMultiSeriesSectionWrongPairing(studentAnswer, target)
  ) {
    help = buildMultiSeriesSectionSeparateWritingCoaching(meta, labels)
  }

  if (
    ruleName === 'section_interpretation'
    && target.isMultiSeriesSection
    && hasMultiSeriesSectionWrongPairing(studentAnswer, target)
  ) {
    const mismatched = assessMultiSeriesSectionYEndpoints(studentAnswer, target).seriesResults.find(
      (result) => result.hasWrongNumbersInSegment,
    )

    if (mismatched) {
      help = `${formatSubjectPossessive(mismatched.label)} 그래프에서 읽은 시작값과 끝값이 맞는지 다시 확인해 보세요.`
    }
  }

  if (ruleName === 'point_value' && isMultiSeriesGraph(meta)) {
    const seriesStatus = getSeriesValueMatchStatus(studentAnswer, target, meta)
    const missingSeriesHelp = buildMissingSeriesCoaching(seriesStatus, meta, xText)

    if (
      missingSeriesHelp
      && (quality === 'partial' || quality === 'close')
      && seriesStatus.found.length >= 1
      && seriesStatus.missing.length >= 1
    ) {
      help = missingSeriesHelp
    }
  }

  return {
    help,
    hintLevel: stepLevel,
    showAnswer: false,
  }
}

/**
 * @param {string} answer
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 */
function classifySectionInterpretationQuality(answer, target, meta) {
  const direction = target.sectionDirection ?? 'increase'
  const studentNumbers = extractNumbers(answer)
  const endpointInfo = assessStrictSectionEndpoints(answer, target, meta)
  const mentionsYLabel = includesLabel(answer, meta.yLabel)
  const hasRangeContext = hasSectionRangeContext(answer, target)
  const expectations = target.seriesSectionExpectations ?? []
  const hasDirection = target.isMultiSeriesSection
    ? hasMultiSeriesSectionDirectionSignal(answer, meta, expectations)
    : hasSectionDirectionSignal(answer, meta.yLabel, direction)
  const yEndpointsCorrect = hasStrictSectionYEndpoints(answer, target, meta)
  const claimsNumericValues = studentNumbers.length > 0
  const directionMismatch = target.isMultiSeriesSection
    ? hasMultiSeriesSectionDirectionMismatch(answer, meta, expectations)
    : hasSectionDirectionMismatch(answer, meta.yLabel, direction)
  const hasInvalidNumbers =
    claimsNumericValues
    && (hasStrictInvalidSectionNumbers(answer, target, meta)
      || hasMultiSeriesSectionWrongPairing(answer, target))

  if (hasInvalidNumbers) {
    return 'wrong'
  }

  if (claimsNumericValues && !yEndpointsCorrect) {
    return endpointInfo.anyEndpoint || hasRangeContext ? 'partial' : 'wrong'
  }

  if (directionMismatch) {
    return 'partial'
  }

  if (usesForbiddenMovementWording(meta.yLabel, answer, direction) && !yEndpointsCorrect) {
    return 'wrong'
  }

  if (yEndpointsCorrect) {
    if (
      hasExplicitWrongYUnit(answer, meta.yUnit)
      && !mentionsYLabel
      && !target.isMultiSeriesSection
    ) {
      return 'wrong'
    }

    if (!hasRequiredSectionQuantityContext(answer, meta, target)) {
      return 'partial'
    }

    if (usesForbiddenMovementWording(meta.yLabel, answer, direction)) {
      return 'partial'
    }

    if (hasDirection) {
      return 'complete'
    }

    return 'partial'
  }

  if (direction === 'constant') {
    const flatValue = target.expectedNumbers?.[2] ?? target.sectionEndY
    const mentionsFlatValue =
      flatValue !== undefined
      && flatValue !== null
      && studentNumbers.some((value) => valueMatchesSectionExpectedNumber(value, flatValue))

    if (hasDirection && (mentionsFlatValue || hasRangeContext || mentionsYLabel)) {
      return 'complete'
    }

    if (hasDirection || mentionsFlatValue || hasRangeContext) {
      return 'close'
    }

    if (mentionsYLabel || mentionsFlatValue) {
      return 'partial'
    }
  }

  if (hasDirection && mentionsYLabel && !claimsNumericValues) {
    return 'close'
  }

  if (endpointInfo.anyEndpoint || hasDirection || mentionsYLabel || hasRangeContext) {
    return 'partial'
  }

  return 'wrong'
}

/**
 * @param {ReturnType<typeof buildCoachingContext>} context
 * @param {CoachingTarget} target
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @returns {AnswerQuality}
 */
function classifyAnswerQuality(context, target, meta) {
  const answer = context.studentAnswer.trim()
  const ruleName = context.ruleName

  if (!answer) return 'wrong'

  if (isGiveUpAnswer(answer)) return 'give_up'

  if (ruleName === 'relation_check') {
    const hasX = includesLabel(answer, meta.xLabel)
    const hasY = includesLabel(answer, meta.yLabel)
    if (hasX && hasY) return 'complete'
    if (hasX || hasY) return 'partial'
    return 'wrong'
  }

  if (ruleName === 'summary' || ruleName === 'insight_summary' || ruleName === 'feature_summary') {
    if (answer.length >= 20 && /(입니다|이에요|예요|다\.|요\.)/.test(answer)) return 'complete'
    if (answer.length >= 12) return 'close'
    return 'partial'
  }

  if (ruleName === 'section_interpretation') {
    return classifySectionInterpretationQuality(answer, target, meta)
  }

  if (ruleName === 'trend_direction' || ruleName === 'trend_fact') {
    if (answer.length >= 15 && /(입니다|이에요|예요|다\.|요\.)/.test(answer)) {
      if (/(증가|감소|변하지|유지|올라|내려)/.test(answer)) return 'complete'
      return 'close'
    }
    if (target.expectedTexts?.length && isAnswerCloseToText(answer, target.expectedTexts)) return 'close'
    return 'partial'
  }

  if (ruleName === 'repeat_pattern') {
    if (answer.length >= 15 && /(입니다|이에요|예요|다\.|요\.)/.test(answer)) {
      if (/(반복|같은|주기|다시)/.test(answer)) return 'complete'
      return 'close'
    }
    return 'partial'
  }

  if (ruleName === 'point_value') {
    return classifyPointValueQuality(answer, target, meta)
  }

  const studentNumbers = extractNumbers(answer)
  const expectedY = target.y
  const expectedX = target.x

  if (!studentNumbers.length) {
    if (target.expectedTexts?.length && isAnswerCloseToText(answer, target.expectedTexts)) return 'close'
    return 'wrong'
  }

  const hasCorrectY =
    expectedY !== undefined
    && studentNumbers.some((value) => Math.abs(value - expectedY) <= 0.2)
  const hasXContext = hasXContextInAnswer(answer, expectedX, meta.xUnit, meta.xLabel)
  const multipleNumbers = studentNumbers.length >= 2

  if (hasCorrectY) {
    if (multipleNumbers) return 'numbers_only'
    if (isFullSentenceAnswer(answer, meta.yLabel, meta.yUnit) && hasXContext) return 'complete'
    return 'close'
  }

  if (multipleNumbers) return 'numbers_only'

  return 'wrong'
}

function getTargetXText(target, meta) {
  return target.x !== undefined ? formatXValue(target.x, meta.xUnit) : meta.xLabel
}

function getStepLabels(meta, target, context) {
  const xText =
    target.x !== undefined
      ? formatXValue(target.x, meta.xUnit)
      : context?.xText || meta.xLabel

  return {
    xLabel: meta.xLabel,
    yLabel: meta.yLabel,
    xText,
    seriesLabels: getSeriesLabels(meta),
    sectionStartText: target.sectionStartText ?? context?.sectionStartText ?? '',
    sectionEndText: target.sectionEndText ?? context?.sectionEndText ?? '',
    sectionRangeText: target.sectionRangeText ?? context?.sectionRangeText ?? '',
    yStartText: target.yStartText ?? '',
    yEndText: target.yEndText ?? '',
    sectionDirection: target.sectionDirection,
    isMultiSeries: getSeriesLabels(meta).length >= 2,
  }
}

/**
 * @param {ReturnType<typeof buildCoachingContext>} context
 * @param {Record<string, string>} problem
 */
export function evaluateCoachingAnswer(context, problem) {
  const meta = getProblemMeta(problem)
  const target = resolveCoachingTarget(context, problem)
  const quality = classifyAnswerQuality(context, target, meta)
  return { meta, target, quality }
}

/**
 * @param {ReturnType<typeof buildCoachingContext>} context
 * @param {Record<string, string>} problem
 * @returns {import('./aiCoaching.js').CoachingResponse}
 */
export function createCoachingResponse(context, problem) {
  const meta = getProblemMeta(problem)
  const target = resolveCoachingTarget(context, problem)
  const quality = classifyAnswerQuality(context, target, meta)

  return buildCoachingResponseFromQuality(
    quality,
    target,
    meta,
    context.hintLevel,
    context.studentAnswer,
    context.ruleName,
    context,
  )
}

/**
 * @param {ReturnType<typeof buildCoachingContext>} context
 * @param {Record<string, string>} problem
 * @returns {import('./aiCoaching.js').CoachingResponse}
 */
export function createMockCoachingResponse(context, problem) {
  return createCoachingResponse(context, problem)
}

/**
 * @param {{
 *   problem: Record<string, string>,
 *   question: { text: string, ruleName: string, questionSet: string },
 *   studentAnswer: string,
 *   hintLevel: number,
 * }} params
 * @returns {Promise<import('./aiCoaching.js').CoachingResponse>}
 */
export async function requestCoaching(params) {
  const context = buildCoachingContext(params)

  if (!isCoachingApiConfigured()) {
    await delay(500)
    return createMockCoachingResponse(context, params.problem)
  }

  const apiPath = import.meta.env.VITE_AI_COACHING_API_PATH?.trim() || '/api/coaching'

  try {
    const response = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(context),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : `AI 코칭 요청에 실패했습니다. (${response.status})`,
      )
    }

    const parsed = parseCoachingResponse(data)

    if (!parsed) {
      throw new Error('AI 응답 형식을 이해하지 못했습니다. JSON 형식으로 다시 시도해 주세요.')
    }

    const meta = getProblemMeta(params.problem)
    const target = resolveCoachingTarget(context, params.problem)
    const quality = classifyAnswerQuality(context, target, meta)

    return buildCoachingResponseFromQuality(
      quality,
      target,
      meta,
      context.hintLevel,
      context.studentAnswer,
      context.ruleName,
      context,
    )
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'AI 코칭 서버에 연결하지 못했습니다. live 모드는 npm run dev:live(netlify dev) 또는 Netlify 배포 환경에서 사용하세요.',
      )
    }

    throw error
  }
}

/**
 * @param {Record<string, string>} problem
 * @param {{ ruleName: string, text: string }} question
 */
export function buildReferenceAnswer(problem, question) {
  const context = buildCoachingContext({
    problem,
    question: {
      text: question.text,
      ruleName: question.ruleName,
      questionSet: question.questionSet ?? '',
      section: question.section,
    },
    studentAnswer: '',
    hintLevel: 3,
  })

  const target = resolveCoachingTarget(context, problem)
  return target.referenceAnswer
}

/**
 * @returns {'mock' | 'live'}
 */
function getCoachingMode() {
  const mode = import.meta.env.VITE_AI_COACHING_MODE?.trim().toLowerCase()
  return mode === 'live' ? 'live' : 'mock'
}

export function isCoachingApiConfigured() {
  return getCoachingMode() === 'live'
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @typedef {Object} CoachingResponse
 * @property {string} help
 * @property {number} hintLevel
 * @property {boolean} showAnswer
 * @property {boolean} [isComplete]
 */
