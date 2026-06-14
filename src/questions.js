import { parseSeriesFromPoints } from './graph.js'
import { isRuleApplicable } from './graphFeatures.js'

/** @type {Record<string, string>[]} */
let questionRules = []

/** @type {Map<string, string>} */
let templatesByRuleName = new Map()

/** @type {Record<string, number>} */
const RULE_STAGE = {
  relation_check: 1,
  point_value: 2,
  final_value: 2,
  constant_section: 3,
  max_value: 3,
  max_value_section: 3,
  max_min_value: 3,
  stop_section: 3,
  increase_decrease: 3,
  change_pattern: 3,
  trend_direction: 3,
  repeat_check: 3,
  value_compare: 4,
  intersection_point: 4,
  repeat_pattern: 4,
  repeat_cycle: 4,
  repeat_reason: 4,
  change_rate_compare: 4,
  compare_summary: 5,
  feature_summary: 6,
  insight_summary: 6,
  summary: 7,
}

function getRuleStage(ruleName) {
  return RULE_STAGE[ruleName] ?? 3
}

function sortQuestionsByThinkingFlow(questions, questionSets) {
  const questionSetOrder = new Map(questionSets.map((set, index) => [set, index]))

  return questions.sort((a, b) => {
    const stageDiff = getRuleStage(a.ruleName) - getRuleStage(b.ruleName)
    if (stageDiff !== 0) return stageDiff

    const setDiff =
      (questionSetOrder.get(a.questionSet) ?? Number.MAX_SAFE_INTEGER)
      - (questionSetOrder.get(b.questionSet) ?? Number.MAX_SAFE_INTEGER)
    if (setDiff !== 0) return setDiff

    return Number(a.ruleOrder) - Number(b.ruleOrder)
  })
}

export function initQuestionData(rules, templates) {
  questionRules = rules
  templatesByRuleName = new Map(
    templates.filter((row) => row.ruleName?.trim()).map((row) => [row.ruleName.trim(), row.template ?? '']),
  )
}

export function buildQuestions(problem) {
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
      const template = templatesByRuleName.get(ruleName)
      if (!template || !isRuleApplicable(ruleName, problem)) return

      questions.push({
        id: `${questionSet}-${rule.ruleOrder}-${ruleName}`,
        questionSet,
        ruleName,
        ruleOrder: rule.ruleOrder,
        text: fillTemplate(template, problem, ruleName),
      })
    })
  })

  return sortQuestionsByThinkingFlow(questions, questionSets)
}

function formatPointNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function getQuestionPointsSource(problem) {
  const questionPoints = problem.questionPoints?.trim()
  if (questionPoints) return questionPoints

  return problem.points?.trim() ?? ''
}

function getPrimarySeriesQuestionPoints(problem) {
  return parseSeriesFromPoints(getQuestionPointsSource(problem))[0]?.points ?? []
}

function getAllQuestionSeries(problem) {
  return parseSeriesFromPoints(getQuestionPointsSource(problem))
}

function pickRepresentativeX(xValues, avoidX = null) {
  const sorted = [...new Set(xValues)].sort((a, b) => a - b)
  if (!sorted.length) return null

  const candidates =
    sorted.length > 1 && approxEqual(sorted[0], 0) ? sorted.slice(1) : sorted
  const midIndex = Math.floor((candidates.length - 1) / 2)
  let selected = candidates[midIndex]

  if (avoidX !== null && candidates.length > 1 && approxEqual(selected, avoidX)) {
    if (midIndex > 0) {
      selected = candidates[midIndex - 1]
    } else if (midIndex < candidates.length - 1) {
      selected = candidates[midIndex + 1]
    }
  }

  return selected
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function getSharedXValues(seriesList) {
  if (seriesList.length < 2) return []

  const [firstSeries, ...otherSeries] = seriesList
  const firstXValues = new Set(firstSeries.points.map((point) => point.x))

  return [...firstXValues]
    .filter((x) => otherSeries.every((series) => series.points.some((point) => approxEqual(point.x, x))))
    .sort((a, b) => a - b)
}

function fillPointValueQuestion(problem) {
  const xUnit = problem.xUnit?.trim() ?? ''
  const yLabel = problem.yLabel?.trim() ?? ''
  const questionPoints = getPrimarySeriesQuestionPoints(problem)
  const x = pickRepresentativeX(questionPoints.map((point) => point.x))

  if (x !== null && questionPoints.some((point) => approxEqual(point.x, x))) {
    const xText = `${formatPointNumber(x)}${xUnit}`
    return `${xText}일 때 ${yLabel}는 얼마인가요?`
  }

  return `그래프에서 한 시점을 골라, 그때의 ${yLabel}는 얼마인지 써 보세요.`
}

function fillValueCompareQuestion(problem) {
  const xUnit = problem.xUnit?.trim() ?? ''
  const yLabel = problem.yLabel?.trim() ?? ''
  const questionPoints = getPrimarySeriesQuestionPoints(problem)
  const pointValueX = pickRepresentativeX(questionPoints.map((point) => point.x))
  const sharedXValues = getSharedXValues(getAllQuestionSeries(problem))
  const x = pickRepresentativeX(sharedXValues, pointValueX)

  if (x !== null) {
    const xText = `${formatPointNumber(x)}${xUnit}`
    return `${xText}일 때 두 대상의 ${yLabel}를 비교해 보세요.`
  }

  const xLabel = problem.xLabel?.trim() ?? '시각'
  return `그래프에 표시된 같은 ${xLabel}에서 두 대상의 ${yLabel}를 비교해 보세요.`
}

function fillTemplate(template, problem, ruleName) {
  if (ruleName === 'point_value') {
    return fillPointValueQuestion(problem)
  }

  if (ruleName === 'value_compare') {
    return fillValueCompareQuestion(problem)
  }

  const xLabel = problem.xLabel?.trim() ?? ''
  const xUnit = problem.xUnit?.trim() ?? ''
  const yLabel = problem.yLabel?.trim() ?? ''
  const yUnit = problem.yUnit?.trim() ?? ''
  const openPrompt = '그래프에서 한 시점을 골라'

  let text = template

  text = text
    .replace(/\[xValue\]\[xUnit\]/g, openPrompt)
    .replace(/\[xLabel\]/g, xLabel)
    .replace(/\[xUnit\]/g, xUnit)
    .replace(/\[yLabel\]/g, yLabel)
    .replace(/\[yUnit\]/g, yUnit)
    .replace(/\[xValue\]/g, openPrompt)
    .replace(/\[answer\]/g, openPrompt)
    .replace(/\[[^\]]+\]/g, openPrompt)

  return text
}
