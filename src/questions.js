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
      if (shouldSkipQuestion(ruleName, questionSet, problem)) return

      questions.push({
        id: `${questionSet}-${rule.ruleOrder}-${ruleName}`,
        questionSet,
        ruleName,
        ruleOrder: rule.ruleOrder,
        text: fillTemplate(template, problem, ruleName),
      })
    })
  })

  let result = sortQuestionsByThinkingFlow(deduplicateQuestionsByRule(questions, questionSets), questionSets)

  if (isWindPowerProblem(problem) && !result.some((question) => question.ruleName === 'summary')) {
    const summaryTemplate = templatesByRuleName.get('summary')
    if (summaryTemplate) {
      result.push({
        id: 'speed_output-final-summary',
        questionSet: 'speed_output',
        ruleName: 'summary',
        ruleOrder: 99,
        text: fillTemplate(summaryTemplate, problem, 'summary'),
      })
      result = sortQuestionsByThinkingFlow(result, questionSets)
    }
  }

  return result
}

function deduplicateQuestionsByRule(questions, questionSets) {
  const seenRuleNames = new Set()
  const questionSetOrder = new Map(questionSets.map((set, index) => [set, index]))

  const ordered = [...questions].sort((a, b) => {
    const setDiff =
      (questionSetOrder.get(a.questionSet) ?? Number.MAX_SAFE_INTEGER)
      - (questionSetOrder.get(b.questionSet) ?? Number.MAX_SAFE_INTEGER)
    if (setDiff !== 0) return setDiff

    return Number(a.ruleOrder) - Number(b.ruleOrder)
  })

  return ordered.filter((question) => {
    if (seenRuleNames.has(question.ruleName)) return false
    seenRuleNames.add(question.ruleName)
    return true
  })
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

function hasKoreanBatchim(text) {
  if (!text) return false
  const char = text.charAt(text.length - 1)
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

function withTopicParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '은' : '는'}`
}

function withSubjectParticle(label) {
  if (!label) return ''
  return `${label}${hasKoreanBatchim(label) ? '이' : '가'}`
}

function fixKoreanParticles(text, xLabel, yLabel) {
  let result = text

  if (yLabel) {
    result = result.replaceAll(`${yLabel}는`, withTopicParticle(yLabel))
    result = result.replaceAll(`${yLabel}가`, withSubjectParticle(yLabel))
  }

  if (xLabel) {
    result = result.replaceAll(`${xLabel}가`, withSubjectParticle(xLabel))
  }

  return result
}

function hasQuestionSet(problem, questionSet) {
  return (problem.questionSet ?? '')
    .split(',')
    .map((set) => set.trim())
    .includes(questionSet)
}

function isTideHeightProblem(problem) {
  return problem.keyword?.trim() === '바다'
}

function isOvenTemperatureProblem(problem) {
  return problem.keyword?.trim() === '요리'
}

function isCarouselHeightProblem(problem) {
  return problem.keyword?.trim() === '회전목마'
}

function isRunningComparisonProblem(problem) {
  return problem.keyword?.trim() === '체육대회'
}

function isFamilyTripSpeedProblem(problem) {
  return problem.keyword?.trim() === '가족여행'
}

function isWindPowerProblem(problem) {
  return problem.keyword?.trim() === '바람의 힘'
}

function shouldSkipQuestion(ruleName, questionSet, problem) {
  if (isOvenTemperatureProblem(problem)) {
    return (
      (questionSet === 'time_temperature' && ruleName === 'repeat_reason')
      || (questionSet === 'periodic' && ruleName === 'repeat_reason')
    )
  }

  if (isCarouselHeightProblem(problem)) {
    return questionSet === 'periodic' && (ruleName === 'repeat_cycle' || ruleName === 'repeat_reason')
  }

  if (isWindPowerProblem(problem)) {
    return ruleName === 'trend_direction' || ruleName === 'feature_summary'
  }

  return false
}

function buildPointValueQuestionText(xText, yLabel, problem) {
  const xLabel = problem.xLabel?.trim() ?? ''

  switch (yLabel) {
    case '거리':
      if (isRunningComparisonProblem(problem)) {
        return `${xText} 후 이동한 거리는 얼마인가요?`
      }
      return `${xText} 동안 이동한 거리는 얼마인가요?`
    case '속력':
      if (isFamilyTripSpeedProblem(problem)) {
        return `${xText}이 지난 후 속력은 얼마인가요?`
      }
      return `${xText}일 때 속력은 얼마인가요?`
    case '높이':
      return `${xText}일 때 높이는 얼마인가요?`
    case '온도':
      return `${xText}일 때 온도는 얼마인가요?`
    case '발전량':
      return `${withSubjectParticle(xLabel)} ${xText}일 때 발전량은 얼마인가요?`
    case '농도':
      if (hasQuestionSet(problem, 'year_concentration')) {
        return `${xText}의 이산화탄소 농도는 얼마인가요?`
      }
      return `${xText}일 때 ${withTopicParticle(yLabel)} 얼마인가요?`
    default:
      return `${xText}일 때 ${withTopicParticle(yLabel)} 얼마인가요?`
  }
}

function fillPointValueQuestion(problem) {
  const xUnit = problem.xUnit?.trim() ?? ''
  const yLabel = problem.yLabel?.trim() ?? ''
  const questionPoints = getPrimarySeriesQuestionPoints(problem)
  const x = pickRepresentativeX(questionPoints.map((point) => point.x))

  if (x !== null && questionPoints.some((point) => approxEqual(point.x, x))) {
    const xText = `${formatPointNumber(x)}${xUnit}`
    return buildPointValueQuestionText(xText, yLabel, problem)
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
    if (isRunningComparisonProblem(problem)) {
      return `출발 후 ${xText}일 때 두 사람이 이동한 거리를 비교해 보세요.`
    }
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

  const yLabel = problem.yLabel?.trim() ?? ''

  if (ruleName === 'final_value' && yLabel === '거리') {
    return '최종 이동한 거리는 얼마인가요?'
  }

  if (ruleName === 'constant_section' && yLabel === '거리') {
    return '움직이지 않은 구간은 어디인가요?'
  }

  if (isWindPowerProblem(problem)) {
    const windQuestions = {
      max_value_section: '발전량이 가장 많은 구간은 어디인가요?',
      change_pattern: '풍속이 변할 때 발전량은 어떻게 변하나요?',
      change_rate_compare: '발전량의 변화가 더 큰 구간과 더 작은 구간을 비교해 보세요.',
      insight_summary: '이 그래프를 보고 풍력 발전기를 사용할 때 알 수 있는 점을 설명해 보세요.',
    }

    if (windQuestions[ruleName]) {
      return windQuestions[ruleName]
    }
  }

  if (ruleName === 'max_min_value' && hasQuestionSet(problem, 'year_concentration')) {
    return '이산화탄소 농도가 가장 높을 때와 가장 낮을 때의 농도는 각각 얼마인가요?'
  }

  if (ruleName === 'trend_direction' && hasQuestionSet(problem, 'year_concentration')) {
    return '연도가 지날수록 이산화탄소 농도는 어떻게 변하고 있나요?'
  }

  if (ruleName === 'insight_summary' && hasQuestionSet(problem, 'year_concentration')) {
    return '그래프를 보고 관찰한 내용을 설명해 보세요.'
  }

  if (isTideHeightProblem(problem)) {
    const tideQuestions = {
      max_min_value: '해수면 높이가 가장 높을 때와 가장 낮을 때의 시간과 높이는 각각 얼마인가요?',
      repeat_check: '해수면 높이가 가장 낮은 때는 하루에 몇 번 나타나나요?',
      repeat_pattern: '해수면 높이가 가장 높은 때는 하루에 몇 번 나타나나요?',
      repeat_cycle: '가장 높은 때와 가장 높은 때 사이는 몇 시간 간격인가요?',
      repeat_reason: '가장 낮은 때와 가장 낮은 때 사이는 몇 시간 간격인가요?',
    }

    if (tideQuestions[ruleName]) {
      return tideQuestions[ruleName]
    }
  }

  if (isOvenTemperatureProblem(problem)) {
    const ovenQuestions = {
      max_min_value: '5분 후부터 12분 후까지 가장 높은 온도와 가장 낮은 온도는 각각 얼마인가요?',
      repeat_pattern: '5분 후 온도가 가장 높은 시간은 언제인가요?',
      repeat_cycle: '5분 후 온도가 가장 낮은 시간은 언제인가요?',
    }

    if (ovenQuestions[ruleName]) {
      return ovenQuestions[ruleName]
    }
  }

  if (isCarouselHeightProblem(problem)) {
    const carouselQuestions = {
      max_min_value: '가장 높이 올라갔을 때의 높이와 가장 낮게 내려왔을 때의 높이는 각각 얼마인가요?',
      repeat_check: '가장 높이 올라가는 데 걸린 시간은 얼마인가요?',
      repeat_pattern: '가장 낮게 내려오는 데 걸린 시간은 얼마인가요?',
    }

    if (carouselQuestions[ruleName]) {
      return carouselQuestions[ruleName]
    }
  }

  if (isRunningComparisonProblem(problem)) {
    const runningQuestions = {
      intersection_point: '두 사람이 만날 때의 시간과 이동 거리는 각각 얼마인가요?',
      compare_summary: '두 사람의 이동 거리를 비교하며 설명해 보세요.',
    }

    if (runningQuestions[ruleName]) {
      return runningQuestions[ruleName]
    }
  }

  if (isFamilyTripSpeedProblem(problem)) {
    const familyTripQuestions = {
      max_value: '가장 빠른 속력은 얼마인가요?',
      stop_section: '움직이지 않은 구간은 언제인가요?',
      increase_decrease: '속력이 증가하는 구간과 감소하는 구간은 어디인가요?',
    }

    if (familyTripQuestions[ruleName]) {
      return familyTripQuestions[ruleName]
    }
  }

  const xLabel = problem.xLabel?.trim() ?? ''
  const xUnit = problem.xUnit?.trim() ?? ''
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

  return fixKoreanParticles(text, xLabel, yLabel)
}
