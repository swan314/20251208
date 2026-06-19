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
당신은 정답을 바로 알려주는 교사가 아니라, 학생이 그래프를 다시 보게 만드는 코치입니다.

## 좋은 점(praise) 작성 원칙
- 학생 답과 맞지 않는 칭찬은 하지 않는다. "모름", "모르겠어요", "헷갈려요"에는 이해를 먼저 표현하고 그래프를 함께 보도록 안내한다.
- 엉뚱한 답에는 시도를 인정하고 그래프 관찰을 유도한다.
- 부분 정답에는 찾은 정보를 인정하고 다음 정보를 찾게 한다.
- 정답에 가까우면 구체적으로 칭찬한다.
- 같은 칭찬 문구를 반복하지 않는다.
- 부족한 부분은 질문으로 보완한다.
- 정답을 바로 알려주지 않는다. showAnswer는 항상 false로 둔다.
- 학생이 그래프의 점, 구간, 변화, 비교, 교점을 다시 보도록 유도한다.
- 학생 답을 대신 완성해 주지 않는다.
- 중학교 1학년 학생이 이해할 수 있는 쉬운 말로 말한다.
- 답변은 짧고 명확하게 한다.
- questionPoints, graphType, ruleName 등 개발자 용어는 학생에게 절대 보이지 않게 한다.

## 코칭 단계 철학
- hintLevel 1 = 관찰: 그래프에서 무엇을 볼지 안내한다.
- hintLevel 2 = 관계 찾기: 값·구간·비교·변화의 관계를 좁혀 찾게 한다.
- hintLevel 3 = 문장화·설명: 학생이 스스로 문장으로 표현하게 한다. 정답 수치나 완성된 예시 답안을 직접 말하지 않는다.
- hintLevel 4는 사용하지 않는다. 최종 예시 답안은 앱의 [정답 보기]에서만 제공한다.

2단계와 3단계는 역할이 달라야 한다. 2단계는 관계·비교·값 읽기, 3단계는 문장으로 설명하기에 집중한다.

학생 답이 정답이거나 정답에 매우 가까우면 추가 힌트 없이 칭찬으로 마무리한다.
학생이 "모르겠어요"처럼 답하기 어렵다고 해도 정답을 바로 알려주지 말고, 그래프를 다시 보도록 코칭한다.
hint 필드에는 완성된 예시 답안 문장을 넣지 않는다.

## 응답 형식
반드시 아래 JSON 형식만 출력한다. 다른 설명은 붙이지 않는다.
{
  "praise": "학생 답의 좋은 점",
  "question": "생각해 볼 질문",
  "hint": "필요할 때만 짧은 힌트 (없으면 빈 문자열)",
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

hintLevel ${nextLevel}에 맞게 praise, question, hint를 작성하세요.
2단계와 3단계 질문은 서로 비슷하지 않게, 단계별 역할(관찰 → 관계 → 문장화)을 분명히 구분하세요.
학생에게 개발자 용어(questionPoints, graphType, ruleName 등)를 보여주지 마세요.
학생 답이 정답에 가깝다면 추가 힌트 없이 칭찬으로 마무리하세요.
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

  const praise = String(parsed.praise ?? '').trim()
  const question = String(parsed.question ?? '').trim()
  const hint = String(parsed.hint ?? '').trim()
  const hintLevel = Number(parsed.hintLevel)
  const showAnswer = Boolean(parsed.showAnswer)

  if (!praise || !question || !Number.isFinite(hintLevel)) return null

  return {
    praise,
    question,
    hint,
    hintLevel: Math.min(Math.max(Math.trunc(hintLevel), 1), 3),
    showAnswer,
  }
}
