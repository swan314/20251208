/**
 * 그래프 이야기가 앞 단계 구간 해석 내용을 반영했는지 점검한다.
 * 문장 표현·맞춤법이 아니라 구간별 변화 포함 여부만 확인한다.
 */

const VALUE_MATCH_TOLERANCE = 0.2

const CONSTANT_KEYWORDS = [
  '변하지',
  '유지',
  '같',
  '그대로',
  '일정',
  '변화가 없',
  '변화 없',
  '이동하지',
  '멈',
  '정지',
  '쉬',
]

const GENERIC_INCREASE_KEYWORDS = ['증가', '올라', '올랐', '상승', '커', '커졌', '늘', '늘었']
const GENERIC_DECREASE_KEYWORDS = ['감소', '내려', '내렸', '하강', '작아', '작아졌', '줄', '줄었']
const HEIGHT_INCREASE_KEYWORDS = ['높아', '높아졌', '올라', '올라갔', '상승', '증가', '커', '커졌']
const HEIGHT_DECREASE_KEYWORDS = ['낮아', '낮아졌', '내려', '내려갔', '하강', '감소', '작아', '작아졌']
const SPEED_INCREASE_KEYWORDS = ['증가', '빨라', '빨라졌', '빨라지', '늘어남', '늘어났', '늘었', '늘']
const SPEED_DECREASE_KEYWORDS = ['감소', '느려', '느려졌', '느려지', '줄어', '줄어들', '줄었', '줄']
const MOVEMENT_KEYWORDS = ['이동', '움직', '나아', '다녀', '걸']

const STORY_REVIEW_PASS_MESSAGE =
  '그래프의 주요 변화가 잘 포함되었습니다.\n제출용 PDF를 만들 수 있습니다.'

const STORY_REVIEW_FAIL_MESSAGE =
  '앞에서 해석한 구간별 변화가 충분히 포함되지 않았습니다.\n\n증가, 감소, 변하지 않음 등의 내용을 포함하여 다시 작성해 보세요.'

const STORY_REVIEW_PARTIAL_COVERAGE_MESSAGE =
  '그래프의 일부 구간만 설명되었습니다.\n빠진 구간의 변화도 포함해 보세요.'

const STORY_REVIEW_EMPTY_MESSAGE = '그래프 이야기를 먼저 작성한 뒤 점검을 받아 보세요.'

const SECTION_COVERAGE_PASS_RATIO = 0.7

function normalizeAnswer(text) {
  return String(text ?? '').replace(/\s+/g, '').toLowerCase()
}

function extractNumbers(text) {
  const matches = String(text ?? '').match(/\d+\.?\d*/g)
  return matches ? matches.map((value) => Number.parseFloat(value)) : []
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function valueMatchesExpectedNumber(value, expected) {
  return Math.abs(value - expected) <= VALUE_MATCH_TOLERANCE
}

function storyHasExpectedNumber(story, expected) {
  return extractNumbers(story).some((value) => valueMatchesExpectedNumber(value, expected))
}

function includesLabel(text, label) {
  if (!label) return false
  return normalizeAnswer(text).includes(normalizeAnswer(label))
}

function getSectionDirection(yStart, yEnd) {
  if (approxEqual(yStart, yEnd)) return 'constant'
  if (yEnd > yStart) return 'increase'
  return 'decrease'
}

function isDistanceLabel(yLabel) {
  return yLabel?.trim() === '거리'
}

function isSpeedLabel(yLabel) {
  return yLabel?.trim() === '속력'
}

function isHeightLabel(yLabel) {
  return yLabel?.trim() === '높이'
}

function getDirectionKeywords(yLabel, direction) {
  if (direction === 'constant') {
    return CONSTANT_KEYWORDS
  }

  if (isDistanceLabel(yLabel)) {
    if (direction === 'increase') {
      return [...MOVEMENT_KEYWORDS, ...GENERIC_INCREASE_KEYWORDS]
    }

    return [...GENERIC_DECREASE_KEYWORDS, '낮아', '낮아졌']
  }

  if (isSpeedLabel(yLabel)) {
    return direction === 'increase' ? SPEED_INCREASE_KEYWORDS : SPEED_DECREASE_KEYWORDS
  }

  if (isHeightLabel(yLabel)) {
    return direction === 'increase' ? HEIGHT_INCREASE_KEYWORDS : HEIGHT_DECREASE_KEYWORDS
  }

  return direction === 'increase' ? GENERIC_INCREASE_KEYWORDS : GENERIC_DECREASE_KEYWORDS
}

function hasDirectionSignal(story, yLabel, direction) {
  const normalized = normalizeAnswer(story)
  const keywords = getDirectionKeywords(yLabel, direction)
  return keywords.some((keyword) => normalized.includes(normalizeAnswer(keyword)))
}

/** questionPoints 체크포인트 n개 → 구간 n-1개 기준, 70% 이상 반영 시 통과 */
function getRequiredSectionCoverageCount(totalSections) {
  if (totalSections <= 0) return 0
  return Math.ceil(totalSections * SECTION_COVERAGE_PASS_RATIO)
}

/**
 * @param {string} story
 * @param {{
 *   xStart: number,
 *   xEnd: number,
 *   yStart: number,
 *   yEnd: number,
 * }} section
 * @param {{ yLabel: string }} meta
 */
function isSectionReflectedInStory(story, section, meta) {
  const { xStart, xEnd, yStart, yEnd } = section
  const direction = getSectionDirection(yStart, yEnd)
  const hasYStart = storyHasExpectedNumber(story, yStart)
  const hasYEnd = storyHasExpectedNumber(story, yEnd)
  const hasXStart = storyHasExpectedNumber(story, xStart)
  const hasXEnd = storyHasExpectedNumber(story, xEnd)
  const hasDirection = hasDirectionSignal(story, meta.yLabel, direction)

  if (hasYStart && hasYEnd) {
    if (direction === 'constant') {
      return hasDirection || hasXStart || hasXEnd
    }

    return true
  }

  if (direction === 'constant') {
    if (hasDirection && (hasXStart || hasXEnd || hasYStart || hasYEnd)) {
      return true
    }

    return hasYStart && (hasXStart || hasXEnd)
  }

  if (hasDirection && hasXStart && hasXEnd) {
    return true
  }

  if (hasDirection && (hasYStart || hasYEnd) && (hasXStart || hasXEnd)) {
    return true
  }

  return false
}

/**
 * @param {Record<string, string>} problem
 * @param {Array<{ ruleName?: string, section?: { xStart: number, xEnd: number, yStart: number, yEnd: number } }>} questions
 * @param {string} story
 */
export function evaluateGraphStory(problem, questions, story) {
  const trimmed = story.trim()
  const yLabel = problem.yLabel?.trim() ?? ''

  if (trimmed.length < 10) {
    return {
      passed: false,
      message: STORY_REVIEW_EMPTY_MESSAGE,
      coveredSectionCount: 0,
      totalSectionCount: 0,
    }
  }

  const sections = questions
    .filter((question) => question.ruleName === 'section_interpretation' && question.section)
    .map((question) => question.section)

  if (!sections.length) {
    const hasMeaningfulContent = trimmed.length >= 20 && (extractNumbers(trimmed).length > 0 || includesLabel(trimmed, yLabel))
    return {
      passed: hasMeaningfulContent,
      message: hasMeaningfulContent ? STORY_REVIEW_PASS_MESSAGE : STORY_REVIEW_FAIL_MESSAGE,
      coveredSectionCount: 0,
      totalSectionCount: 0,
    }
  }

  const meta = { yLabel }
  const coveredSections = sections.filter((section) => isSectionReflectedInStory(trimmed, section, meta))
  const requiredCount = getRequiredSectionCoverageCount(sections.length)
  const hasNumericContext = extractNumbers(trimmed).length > 0

  if (coveredSections.length >= requiredCount && hasNumericContext) {
    return {
      passed: true,
      message: STORY_REVIEW_PASS_MESSAGE,
      coveredSectionCount: coveredSections.length,
      totalSectionCount: sections.length,
      requiredSectionCount: requiredCount,
    }
  }

  const failMessage =
    coveredSections.length > 0 && hasNumericContext
      ? STORY_REVIEW_PARTIAL_COVERAGE_MESSAGE
      : STORY_REVIEW_FAIL_MESSAGE

  return {
    passed: false,
    message: failMessage,
    coveredSectionCount: coveredSections.length,
    totalSectionCount: sections.length,
    requiredSectionCount: requiredCount,
  }
}

export async function requestGraphStoryReview(params) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 500)
  })

  return evaluateGraphStory(params.problem, params.questions, params.story)
}
