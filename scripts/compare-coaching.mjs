/**
 * G09 2번 질문 기준 mock vs live AI 코칭 비교
 * 실행: node scripts/compare-coaching.mjs
 * 사전 조건: npm run dev:live (8888)
 */

const LIVE_API = process.env.COACHING_API_URL ?? 'http://localhost:8888/api/coaching'

const G09_PROBLEM = {
  id: 'G09',
  keyword: '체육대회',
  title: '10km 달리기 대회',
  graphType: 'compare_curve',
  questionSet: 'time_distance,comparison',
  situation: '두 친구가 달리기 대회에서 이동한 거리 변화',
  background: '',
  xLabel: '시간',
  xUnit: '분',
  xTick: '5',
  yLabel: '거리',
  yUnit: 'km',
  yTick: '1',
  points:
    '서현:(0,0),(15,3),(30,5),(45,6.2),(60,7),(75,8.2),(90,10);지원:(0,0),(15,2),(30,4),(45,5.8),(60,7),(75,8.6),(90,10)',
  questionPoints:
    '서현:(0,0),(15,3),(30,5),(60,7),(90,10);지원:(0,0),(15,2),(30,4),(60,7),(90,10)',
}

const QUESTION = {
  text: '30분 후 이동한 거리는 얼마인가요?',
  ruleName: 'point_value',
  questionSet: 'time_distance',
}

const CASES = [
  { label: '1. 모름', answer: '모름' },
  { label: '2. 부분 정답', answer: '30분' },
  {
    label: '3. 정답',
    answer: '30분 후 서현이의 거리는 5km이고, 지원이의 거리는 4km입니다.',
  },
]

const POINT_VALUE_COACHING = {
  coachingGoal: '특정 x값에 대응하는 y값을 읽도록 돕는다.',
  coachingStrategy:
    '정답을 바로 알려주지 말고 x값 찾기 → y값 확인 → 단위 연결 순으로 질문한다.',
}

async function runMock(caseInfo) {
  const {
    initCoachingRules,
    buildCoachingContext,
    createMockCoachingResponse,
    evaluateCoachingAnswer,
  } = await import('../src/aiCoaching.js')

  initCoachingRules([{ ruleName: 'point_value', ...POINT_VALUE_COACHING }])

  const context = buildCoachingContext({
    problem: G09_PROBLEM,
    question: QUESTION,
    studentAnswer: caseInfo.answer,
    hintLevel: 0,
  })

  const { quality } = evaluateCoachingAnswer(context, G09_PROBLEM)

  return {
    ...createMockCoachingResponse(context, G09_PROBLEM),
    _quality: quality,
  }
}

async function runLive(caseInfo) {
  const {
    initCoachingRules,
    buildCoachingContext,
    createCoachingResponse,
    evaluateCoachingAnswer,
  } = await import('../src/aiCoaching.js')

  initCoachingRules([{ ruleName: 'point_value', ...POINT_VALUE_COACHING }])

  const context = buildCoachingContext({
    problem: G09_PROBLEM,
    question: QUESTION,
    studentAnswer: caseInfo.answer,
    hintLevel: 0,
  })

  const { quality } = evaluateCoachingAnswer(context, G09_PROBLEM)

  // live 모드 앱과 동일: API 연결 확인 후 분류 기반 응답 사용
  const apiResponse = await fetch(LIVE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: G09_PROBLEM.title,
      question: QUESTION.text,
      studentAnswer: caseInfo.answer,
      questionPoints: G09_PROBLEM.questionPoints,
      hintLevel: 0,
      ruleName: QUESTION.ruleName,
      coachingGoal: POINT_VALUE_COACHING.coachingGoal,
      coachingStrategy: POINT_VALUE_COACHING.coachingStrategy,
      xLabel: G09_PROBLEM.xLabel,
      yLabel: G09_PROBLEM.yLabel,
      xUnit: G09_PROBLEM.xUnit,
      yUnit: G09_PROBLEM.yUnit,
      xText: '30분',
    }),
  })

  if (!apiResponse.ok) {
    const data = await apiResponse.json().catch(() => ({}))
    throw new Error(data.error ?? `HTTP ${apiResponse.status}`)
  }

  return {
    ...createCoachingResponse(context, G09_PROBLEM),
    _quality: quality,
  }
}

function formatResult(mode, result) {
  const lines = [
    `  [${mode}] 분류: ${result._quality ?? '?'}`,
    `  좋은 점: ${result.praise}`,
    `  질문: ${result.question}`,
    result.hint ? `  힌트: ${result.hint}` : '  힌트: (없음)',
    `  단계: ${result.hintLevel}${result.isComplete ? ' (완료)' : ''}`,
  ]

  return lines.join('\n')
}

async function main() {
  console.log('=== G09 · 30분 후 이동한 거리는 얼마인가요? ===')
  console.log(`Live API: ${LIVE_API}\n`)

  for (const caseInfo of CASES) {
    console.log(`--- ${caseInfo.label} (답: "${caseInfo.answer}") ---`)

    try {
      const mock = await runMock(caseInfo)
      console.log(formatResult('mock', mock))
    } catch (error) {
      console.log(`  [mock] 오류: ${error.message}`)
    }

    console.log('')

    try {
      const live = await runLive(caseInfo)
      console.log(formatResult('live', live))
    } catch (error) {
      console.log(`  [live] 오류: ${error.message}`)
    }

    console.log('')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
