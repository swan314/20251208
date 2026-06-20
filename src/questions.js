import { parseSeriesFromPoints } from './graph.js'
import { withRoParticleForNumber, withSubjectParticle } from '../shared/koreanParticles.mjs'

/** @type {Record<string, string>[]} */
let questionRules = []

/** @type {Map<string, string>} */
let templatesByRuleName = new Map()

const DEPRECATED_RULE_NAMES = new Set([
  'point_value',
  'final_value',
  'constant_section',
  'compare_value',
  'value_compare',
  'intersection_point',
  'arrival_order',
  'max_value_section',
  'change_rate_compare',
  'observation_summary',
])

export function initQuestionData(rules, templates) {
  questionRules = rules
  templatesByRuleName = new Map(
    templates.filter((row) => row.ruleName?.trim()).map((row) => [row.ruleName.trim(), row.template ?? '']),
  )
}

/**
 * @typedef {{
 *   xStart: number,
 *   xEnd: number,
 *   yStart: number,
 *   yEnd: number,
 *   index: number,
 * }} SectionInterval
 */

/**
 * @typedef {{
 *   id: string,
 *   questionSet: string,
 *   ruleName: string,
 *   ruleOrder: number,
 *   text: string,
 *   section?: SectionInterval & { isMultiSeries?: boolean },
 * }} Question
 */

export function buildQuestions(problem) {
  const checkpoints = getCheckpointPoints(problem)
  const isMultiSeries = isMultiSeriesProblem(problem)
  const questions = []

  questions.push({
    id: `${problem.id}-relation_check`,
    questionSet: 'checkpoint',
    ruleName: 'relation_check',
    ruleOrder: 1,
    text: '이 그래프에서 x축과 y축은 각각 무엇을 나타내나요?',
  })

  const intervals = buildSectionIntervals(checkpoints)
  intervals.forEach((interval, index) => {
    questions.push({
      id: `${problem.id}-section_interpretation-${index + 1}`,
      questionSet: 'checkpoint',
      ruleName: 'section_interpretation',
      ruleOrder: index + 2,
      text: buildSectionQuestionText(problem, interval, isMultiSeries),
      section: {
        ...interval,
        isMultiSeries,
      },
    })
  })

  return questions
}

/** @deprecated Legacy CSV rule builder — kept for reference, not used in default flow. */
export function buildQuestionsFromRules(problem) {
  const questionSets = (problem.questionSet ?? '')
    .split(',')
    .map((set) => set.trim())
    .filter(Boolean)

  const questions = []

  questionSets.forEach((questionSet) => {
    const rules = questionRules
      .filter((rule) => rule.questionSet?.trim() === questionSet)
      .sort((a, b) => Number(a.ruleOrder) - Number(b.ruleOrder))

    rules.forEach((rule) => {
      const ruleName = rule.ruleName?.trim()
      if (!ruleName || DEPRECATED_RULE_NAMES.has(ruleName)) return

      const template = templatesByRuleName.get(ruleName)
      if (!template) return

      questions.push({
        id: `${questionSet}-${rule.ruleOrder}-${ruleName}`,
        questionSet,
        ruleName,
        ruleOrder: rule.ruleOrder,
        text: template,
      })
    })
  })

  return questions
}

function getQuestionPointsSource(problem) {
  const questionPoints = problem.questionPoints?.trim()
  if (questionPoints) return questionPoints

  return problem.points?.trim() ?? ''
}

function isMultiSeriesProblem(problem) {
  return parseSeriesFromPoints(getQuestionPointsSource(problem)).length >= 2
}

/**
 * @param {Record<string, string>} problem
 * @returns {{ x: number, y: number }[]}
 */
export function getCheckpointPoints(problem) {
  const seriesList = parseSeriesFromPoints(getQuestionPointsSource(problem))
  const primaryPoints = seriesList[0]?.points ?? []

  return [...primaryPoints].sort((a, b) => a.x - b.x)
}

/**
 * @param {{ x: number, y: number }[]} checkpoints
 * @returns {SectionInterval[]}
 */
export function buildSectionIntervals(checkpoints) {
  const intervals = []

  for (let index = 0; index < checkpoints.length - 1; index += 1) {
    const start = checkpoints[index]
    const end = checkpoints[index + 1]

    intervals.push({
      xStart: start.x,
      xEnd: end.x,
      yStart: start.y,
      yEnd: end.y,
      index,
    })
  }

  return intervals
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function formatPointNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function formatXValue(x, xUnit) {
  return `${formatPointNumber(x)}${xUnit}`
}

/**
 * @param {Record<string, string>} problem
 * @param {SectionInterval} interval
 * @param {boolean} isMultiSeries
 */
export function buildSectionQuestionText(problem, interval, isMultiSeries) {
  const rangePhrase = buildSectionRangePhrase(problem, interval.xStart, interval.xEnd)
  const suffix = isMultiSeries
    ? '두 사람의 그래프의 변화를 각각 설명해보세요.'
    : '그래프의 변화를 설명해보세요.'

  return `${rangePhrase} ${suffix}`
}

function isClockTimeGraph(problem) {
  const xLabel = problem.xLabel?.trim() ?? ''
  const xUnit = problem.xUnit?.trim() ?? ''
  return xUnit === '시' || xLabel === '시각'
}

function isOvenTemperatureProblem(problem) {
  return problem.keyword?.trim() === '요리'
}

function isCarouselHeightProblem(problem) {
  return problem.keyword?.trim() === '회전목마'
}

/**
 * @param {Record<string, string>} problem
 * @param {number} xStart
 * @param {number} xEnd
 */
export function buildSectionRangePhrase(problem, xStart, xEnd) {
  const xLabel = problem.xLabel?.trim() ?? ''
  const xUnit = problem.xUnit?.trim() ?? ''
  const startText = formatXValue(xStart, xUnit)
  const endText = formatXValue(xEnd, xUnit)

  if (xLabel === '풍속') {
    return `${withSubjectParticle(xLabel)} 초속 ${formatPointNumber(xStart)}에서 초속 ${withRoParticleForNumber(xEnd)} 변할 때`
  }

  if (xLabel === '연도') {
    return `${startText}부터 ${endText}까지`
  }

  if (isClockTimeGraph(problem)) {
    return `${startText}부터 ${endText}까지`
  }

  if (approxEqual(xStart, 0)) {
    if (isOvenTemperatureProblem(problem)) {
      return `작동 후 ${endText}까지`
    }

    if (isCarouselHeightProblem(problem)) {
      return `움직이기 시작한 후 ${endText}까지`
    }

    return `출발 후 ${endText}까지`
  }

  return `${startText}부터 ${endText}까지`
}
