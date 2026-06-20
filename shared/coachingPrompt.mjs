import { getCoachingStepGuidanceForPrompt } from './coachingSteps.mjs'

function getSeriesLabelsFromQuestionPoints(questionPoints) {
  const raw = String(questionPoints ?? '').trim()
  if (!raw.includes(':') || !raw.includes(';')) return []

  return raw
    .split(';')
    .filter(Boolean)
    .map((segment) => segment.slice(0, segment.indexOf(':')).trim())
    .filter(Boolean)
}

export const SYSTEM_PROMPT = `당신은 중학교 1학년 학생을 돕는 그래프 해석 코치입니다.
당신은 정답을 바로 알려주는 교사가 아니라, 학생이 그래프를 빠르게 다시 읽도록 돕는 코치입니다.

## 도움말(help) 작성 원칙
- 학생에게는 "도움말" 한 가지만 보여 줍니다. 칭찬, 질문, 힌트를 나누어 쓰지 않습니다.
- 한 번에 하나의 행동만 안내합니다. 짧고 명확하게 씁니다.
- 정답 수치나 완성된 예시 답안을 직접 말하지 않습니다.
- 학생이 그래프의 점, 구간, 변화, 비교를 다시 보도록 유도합니다.
- 중학교 1학년 학생이 이해할 수 있는 쉬운 말로 씁니다.
- questionPoints, graphType, ruleName 등 개발자 용어는 학생에게 절대 보이지 않게 합니다.
- showAnswer는 항상 false입니다. 최종 예시 답안은 앱의 [정답 보기]에서만 제공합니다.

## 코칭 단계
- hintLevel 1 = 관찰: 그래프에서 무엇을 볼지 안내
- hintLevel 2 = 비교·읽기: 값·구간·변화를 좁혀 찾게 함
- hintLevel 3 = 설명: 학생이 스스로 문장으로 표현하게 함 (정답을 대신 써 주지 않음)

학생 답이 정답에 가깝다면 짧게 격려하고 다음으로 넘어가도 된다고 안내합니다.

## 응답 형식
반드시 아래 JSON 형식만 출력한다. 다른 설명은 붙이지 않는다.
{
  "help": "학생에게 보여 줄 도움말 한 덩어리",
  "hintLevel": 1,
  "showAnswer": false
}`

/**
 * @param {Record<string, unknown>} context
 */
export function buildCoachingUserPrompt(context) {
  const hintLevel = Number(context.hintLevel) || 0
  const nextLevel = Math.min(Math.max(hintLevel, 0) + 1, 3)
  const xText = String(context.xText ?? context.xLabel ?? '해당 위치')

  const stepGuidance = getCoachingStepGuidanceForPrompt(String(context.ruleName ?? ''), nextLevel, {
    xLabel: String(context.xLabel ?? ''),
    yLabel: String(context.yLabel ?? ''),
    xText,
    seriesLabels: getSeriesLabelsFromQuestionPoints(context.questionPoints),
    sectionStartText: String(context.sectionStartText ?? ''),
    sectionEndText: String(context.sectionEndText ?? ''),
  })

  return `다음 학생의 그래프 해석 답변을 코칭해 주세요.
이번 응답의 hintLevel은 ${nextLevel}이어야 합니다.

[문제 정보]
- 제목: ${context.title ?? ''}
- x축: ${context.xLabel ?? ''}
- y축: ${context.yLabel ?? ''}
- 질문 유형(ruleName): ${context.ruleName ?? ''}

[현재 질문]
${context.question ?? ''}

[학생 답변]
${context.studentAnswer ?? ''}

[그래프 참고 점]
${context.questionPoints || '(없음)'}

[코칭 목표]
${context.coachingGoal ?? ''}

[코칭 전략]
${context.coachingStrategy ?? ''}

[현재 힌트 단계]
${hintLevel} (다음 단계 ${nextLevel}로 진행)

[이번 단계 가이드]
${stepGuidance}

hintLevel ${nextLevel}에 맞는 도움말을 help 필드 하나에만 작성하세요.
학생에게 개발자 용어(questionPoints, graphType, ruleName 등)를 보여주지 마세요.
showAnswer는 반드시 false입니다.`
}

/**
 * @param {unknown} value
 */
export function parseCoachingResponse(value) {
  let parsed = value

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null

  const hintLevel = Number(parsed.hintLevel)
  const showAnswer = Boolean(parsed.showAnswer)
  let help = String(parsed.help ?? '').trim()

  if (!help) {
    const praise = String(parsed.praise ?? '').trim()
    const question = String(parsed.question ?? '').trim()
    const hint = String(parsed.hint ?? '').trim()
    help = [question, hint].filter(Boolean).join('\n\n') || praise
  }

  if (!help || !Number.isFinite(hintLevel)) return null

  return {
    help,
    hintLevel: Math.min(Math.max(Math.trunc(hintLevel), 1), 3),
    showAnswer,
  }
}
