import { parseSeriesFromPoints } from './graph.js'
import {
  parseCoachingResponse,
} from '../shared/coachingPrompt.mjs'
import {
  getCoachingStep,
  getCoachingSteps,
} from '../shared/coachingSteps.mjs'
import { isGiveUpAnswer, pickMissingSeriesPraise, pickPraiseForQuality, pickPointValueMultiSeriesCompletePraise, pickPointValueXOnlyPraise } from '../shared/coachingPraise.mjs'
import {
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
 *   question: { text: string, ruleName: string, questionSet: string },
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
 * @property {string} level3Hint
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
  const steps = getCoachingSteps(ruleName, {
    xLabel: meta.xLabel,
    yLabel: meta.yLabel,
    xText: xText ?? (target.x !== undefined ? formatXValue(target.x, meta.xUnit) : meta.xLabel),
    seriesLabels: getSeriesLabels(meta),
  })
  target.level1Question = steps[1].question
  target.level2Question = steps[2].question
  target.level3Hint = steps[3].hint || steps[3].question
  return target
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

/**
 * @param {number[]} studentNumbers
 * @param {number[]} expectedNumbers
 */
function countMatchedExpectedNumbers(studentNumbers, expectedNumbers) {
  return expectedNumbers.filter((expected) =>
    studentNumbers.some((value) => Math.abs(value - expected) <= VALUE_MATCH_TOLERANCE),
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

  return nextLevel
}

/**
 * @param {ReturnType<typeof getSeriesValueMatchStatus>} seriesStatus
 * @param {ReturnType<typeof getProblemMeta>} meta
 * @param {string} xText
 */
function buildMissingSeriesCoaching(seriesStatus, meta, xText) {
  const missingEntry = seriesStatus.missing[0]
  const foundEntry = seriesStatus.found[0]

  if (!missingEntry || !foundEntry) return null

  return {
    praise: pickMissingSeriesPraise(foundEntry.label, missingEntry.label, meta.yLabel),
    question: `${formatSubjectPossessive(missingEntry.label)} ${withTopicParticle(meta.yLabel)} 얼마인가요?`,
    hint: `${xText}에 해당하는 ${formatSubjectPossessive(missingEntry.label)} ${withObjectParticle(meta.yLabel)} 그래프에서 확인해 보세요.`,
  }
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

  if (quality === 'complete') {
    const valuesAtX = target.x !== undefined ? getLabeledSeriesValuesAtX(meta, target.x) : []
    const timePhrase = buildTimePhraseForAnswer(xText, context.question)

    if (ruleName === 'point_value' && valuesAtX.length >= 2) {
      return {
        praise: pickPointValueMultiSeriesCompletePraise(
          timePhrase,
          valuesAtX.map((entry) => entry.label),
          meta.yLabel,
        ),
        question: '이 내용을 바탕으로 그래프의 변화도 함께 설명해 볼 수 있을까요?',
        hint: '',
        hintLevel: stepLevel,
        showAnswer: false,
        isComplete: true,
      }
    }

    return {
      praise: pickPraiseForQuality('complete', { studentAnswer, meta, target }),
      question: '그래프에서 정확하게 값을 읽었습니다.',
      hint: '',
      hintLevel: stepLevel,
      showAnswer: false,
      isComplete: true,
    }
  }

  const step = getCoachingStep(ruleName, stepLevel, labels)
  let praise = pickPraiseForQuality(quality, { studentAnswer, meta, target })
  let question = step.question
  let hint = step.hint

  if (ruleName === 'point_value' && isMultiSeriesGraph(meta)) {
    const seriesStatus = getSeriesValueMatchStatus(studentAnswer, target, meta)
    const missingSeriesCoaching = buildMissingSeriesCoaching(seriesStatus, meta, xText)

    if (
      missingSeriesCoaching
      && (quality === 'partial' || quality === 'close')
      && seriesStatus.found.length >= 1
      && seriesStatus.missing.length >= 1
    ) {
      praise = missingSeriesCoaching.praise
      question = missingSeriesCoaching.question
      hint = missingSeriesCoaching.hint
    } else if (quality === 'partial' && isPointValueXOnlyPartial(studentAnswer, target, meta)) {
      praise = pickPointValueXOnlyPraise(xText)
    }
  } else if (ruleName === 'point_value' && quality === 'partial' && isPointValueXOnlyPartial(studentAnswer, target, meta)) {
    praise = pickPointValueXOnlyPraise(xText)
  }

  return {
    praise,
    question,
    hint,
    hintLevel: stepLevel,
    showAnswer: false,
  }
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
      questionSet: '',
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
 * @property {string} praise
 * @property {string} question
 * @property {string} hint
 * @property {number} hintLevel
 * @property {boolean} showAnswer
 * @property {boolean} [isComplete]
 */
