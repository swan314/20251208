import './style.css'
import {
  buildReferenceAnswer,
  initCoachingRules,
  isCoachingApiConfigured,
  requestCoaching,
} from './aiCoaching.js'
import { fetchCSV } from './csv.js'
import { destroyProblemChart, renderProblemChart } from './graph.js'
import { buildQuestions, initQuestionData } from './questions.js'
import { requestGraphStoryReview } from './storyReview.js'

const DATA_PATHS = {
  problems: '/data/graph_problems.csv',
  rules: '/data/question_rules.csv',
  templates: '/data/question_templates.csv',
  coachingRules: '/data/ai_coaching_rules.csv',
}

const KEYWORD_EMOJI = {
  '산책의 여유': '🚶',
  '자전거 여행': '🚴',
  '바람의 힘': '💨',
  온실가스: '🌍',
  바다: '🌊',
  요리: '🍳',
  '자전거 라이딩': '🚵',
  회전목마: '🎠',
  체육대회: '🏃',
  가족여행: '🚗',
}

function getKeywordEmoji(keyword) {
  return KEYWORD_EMOJI[keyword?.trim()] ?? ''
}

/** @type {Record<string, string>[]} */
let problems = []

/** @type {import('chart.js').Chart | null} */
let currentChart = null

/** @typedef {{
 *   hintLevel: number,
 *   coachingStepCount: number,
 *   response: import('./aiCoaching.js').CoachingResponse | null,
 *   revealedAnswer: string | null,
 *   isAnswerComplete: boolean,
 *   coachedAnswer: string,
 *   loading: boolean,
 *   error: string | null,
 * }} QuestionCoachingState */

/** @typedef {{
 *   status: 'idle' | 'loading' | 'passed' | 'failed',
 *   message: string,
 *   reviewedStory: string,
 * }} FinalStoryReviewState */

/** @type {{
 *   problemId: string | null,
 *   questionsStarted: boolean,
 *   currentIndex: number,
 *   showFinalReview: boolean,
 *   answers: Record<string, string>,
 *   finalInterpretation: string,
 *   finalStoryWarning: string,
 *   finalStoryReview: FinalStoryReviewState,
 *   navigationWarning: string,
 *   questions: ReturnType<typeof buildQuestions>,
 *   coachingByQuestion: Record<string, QuestionCoachingState>,
 * }} */
let detailState = {
  problemId: null,
  questionsStarted: false,
  currentIndex: 0,
  showFinalReview: false,
  answers: {},
  finalInterpretation: '',
  finalStoryWarning: '',
  finalStoryReview: createDefaultStoryReviewState(),
  navigationWarning: '',
  questions: [],
  coachingByQuestion: {},
}

async function loadAllData() {
  const [problemsRows, rulesRows, templatesRows, coachingRulesRows] = await Promise.all([
    fetchCSV(DATA_PATHS.problems),
    fetchCSV(DATA_PATHS.rules),
    fetchCSV(DATA_PATHS.templates),
    fetchCSV(DATA_PATHS.coachingRules),
  ])

  problems = problemsRows.filter((row) => row.id?.trim())
  initQuestionData(rulesRows, templatesRows)
  initCoachingRules(coachingRulesRows)
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function createDefaultDetailState(problemId = null) {
  return {
    problemId,
    questionsStarted: false,
    currentIndex: 0,
    showFinalReview: false,
    answers: {},
    finalInterpretation: '',
    finalStoryWarning: '',
    finalStoryReview: createDefaultStoryReviewState(),
    navigationWarning: '',
    questions: [],
    coachingByQuestion: {},
  }
}

function createDefaultStoryReviewState() {
  return {
    status: 'idle',
    message: '',
    reviewedStory: '',
  }
}

function createDefaultCoachingState() {
  return {
    hintLevel: 0,
    coachingStepCount: 0,
    response: null,
    revealedAnswer: null,
    isAnswerComplete: false,
    coachedAnswer: '',
    loading: false,
    error: null,
  }
}

const MAX_COACHING_STEPS = 3
const NAVIGATION_ANSWER_REQUIRED_MESSAGE = '답을 입력한 후 다음으로 이동할 수 있습니다.'
const NAVIGATION_COACHING_REQUIRED_MESSAGE =
  'AI 코칭에서 충분한 답변이 인정되거나 정답 보기를 완료한 후 다음으로 이동할 수 있습니다.'

function shouldShowCoachingButton(coaching) {
  return (
    coaching.coachingStepCount < MAX_COACHING_STEPS
    && !coaching.isAnswerComplete
    && !coaching.revealedAnswer
  )
}

function canRequestCoaching(coaching, hasAnswer) {
  return shouldShowCoachingButton(coaching) && hasAnswer && !coaching.loading
}

function canShowAnswerButton(coaching) {
  return (
    coaching.coachingStepCount >= MAX_COACHING_STEPS
    && !coaching.revealedAnswer
    && !coaching.isAnswerComplete
  )
}

function canProceedToNextQuestion(coaching) {
  return coaching.isAnswerComplete || Boolean(coaching.revealedAnswer)
}

function renderCoachingStepProgressHtml(coaching) {
  const steps = ['1차 코칭', '2차 코칭', '3차 코칭', '정답 보기']
  const coachingCount = coaching.coachingStepCount
  const answerRevealed = Boolean(coaching.revealedAnswer)
  const earlyComplete = coaching.isAnswerComplete

  const items = steps
    .map((label, index) => {
      const stepNumber = index + 1
      let status = 'pending'

      if (stepNumber <= 3) {
        if (coachingCount >= stepNumber || earlyComplete) {
          status = 'completed'
        } else if (coachingCount === stepNumber - 1) {
          status = 'next'
        } else if (coachingCount === 0 && stepNumber === 1) {
          status = 'next'
        }
      } else if (answerRevealed) {
        status = 'completed'
      } else if (earlyComplete) {
        status = 'pending'
      } else if (coachingCount >= MAX_COACHING_STEPS) {
        status = 'next'
      }

      return `
        <li class="coaching-progress__item coaching-progress__item--${status}">
          <span class="coaching-progress__marker" aria-hidden="true"></span>
          <span class="coaching-progress__label">${label}</span>
        </li>
      `
    })
    .join('')

  return `
    <ol class="coaching-progress" aria-label="코칭 진행 단계">
      ${items}
    </ol>
  `
}

function isCoachingCompleteResponse(response) {
  return Boolean(response?.isComplete)
}

function getCoachingState(questionId) {
  if (!detailState.coachingByQuestion[questionId]) {
    detailState.coachingByQuestion[questionId] = createDefaultCoachingState()
  }

  return detailState.coachingByQuestion[questionId]
}

function getCurrentProblem() {
  const route = getRoute()
  if (route.view !== 'detail' || !route.id) return null
  return problems.find((item) => item.id === route.id) ?? null
}

function renderCoachingSectionHtml(question, answer) {
  const coaching = getCoachingState(question.id)
  const hasAnswer = Boolean(answer.trim())
  const showCoachingButton = shouldShowCoachingButton(coaching)
  const coachingButtonDisabled = !canRequestCoaching(coaching, hasAnswer)
  const showAnswerButton = canShowAnswerButton(coaching)

  const modeNotice = isCoachingApiConfigured()
    ? '<p class="coaching-panel__mode coaching-panel__mode--live">AI 코칭 모드로 동작합니다.</p>'
    : '<p class="coaching-panel__mode">예시 코칭 모드로 동작합니다. (mock — UI·흐름 확인용)</p>'

  const emptyPrompt = hasAnswer
    ? ''
    : '<p class="coaching-panel__prompt">먼저 자신의 생각을 적어 보세요.</p>'

  const loadingMarkup = coaching.loading
    ? '<p class="coaching-panel__loading" aria-live="polite">AI 코칭을 준비하고 있어요...</p>'
    : ''

  const errorMarkup = coaching.error
    ? `<p class="coaching-panel__error" role="alert">${escapeHtml(coaching.error)}</p>`
    : ''

  const progressMarkup =
    hasAnswer || coaching.coachingStepCount > 0 || coaching.response || coaching.revealedAnswer
      ? renderCoachingStepProgressHtml(coaching)
      : ''

  let resultMarkup = ''
  if (coaching.response && !coaching.revealedAnswer) {
    const stepLabel = `${coaching.coachingStepCount}차 코칭`

    resultMarkup = `
      <div class="coaching-result" aria-live="polite">
        <div class="coaching-result__section coaching-result__section--help">
          <span class="coaching-result__label">${stepLabel}</span>
          <p class="coaching-result__text">${escapeHtml(coaching.response.help)}</p>
        </div>
      </div>
    `
  }

  const answerMarkup = coaching.revealedAnswer
    ? `
      <div class="coaching-result coaching-result--answer" aria-live="polite">
        <div class="coaching-result__section coaching-result__section--answer">
          <span class="coaching-result__label">정답 보기</span>
          <p class="coaching-result__subtitle">그래프에서 확인한 내용</p>
          <p class="coaching-result__text coaching-result__text--answer">${escapeHtml(coaching.revealedAnswer)}</p>
        </div>
      </div>
    `
    : ''

  const showAnswerBtnMarkup = showAnswerButton
    ? `
      <button
        class="coaching-panel__btn coaching-panel__btn--answer"
        id="showAnswerBtn"
        type="button"
      >
        정답 보기
      </button>
    `
    : ''

  const showCoachingBtnMarkup = showCoachingButton
    ? `
        <button
          class="coaching-panel__btn coaching-panel__btn--primary"
          id="requestCoachingBtn"
          type="button"
          ${coachingButtonDisabled ? 'disabled' : ''}
        >
          AI 코칭 받기
        </button>
      `
    : ''

  return `
    <section class="coaching-panel" aria-label="AI 코칭">
      ${modeNotice}
      ${emptyPrompt}
      ${progressMarkup}
      <div class="coaching-panel__actions">
        ${showCoachingBtnMarkup}
        ${showAnswerBtnMarkup}
      </div>
      ${loadingMarkup}
      ${errorMarkup}
      ${resultMarkup}
      ${answerMarkup}
    </section>
  `
}

function renderQuestionStepHtml() {
  const { questions, currentIndex, answers } = detailState

  if (!questions.length) {
    return '<p class="empty-state">표시할 질문이 없습니다.</p>'
  }

  const question = questions[currentIndex]
  const total = questions.length
  const answer = answers[question.id] ?? ''
  const coaching = getCoachingState(question.id)
  const canProceed = canProceedToNextQuestion(coaching)
  const isFirst = currentIndex === 0
  const isLast = currentIndex === total - 1

  return `
    <section class="questions-panel" aria-label="그래프 읽기 질문">
      <div class="questions-progress" aria-live="polite">
        <span class="questions-progress__label">진행 상황</span>
        <span class="questions-progress__count">${currentIndex + 1} / ${total}</span>
      </div>

      <div class="question-item question-item--step">
        <label class="question-item__label" for="currentAnswerInput">
          <span class="question-item__number">${currentIndex + 1}</span>
          <span class="question-item__text">${escapeHtml(question.text)}</span>
        </label>
        <textarea
          class="question-item__input question-item__input--auto"
          id="currentAnswerInput"
          rows="1"
          placeholder="답을 입력하세요"
          autocomplete="off"
        >${escapeHtml(answer)}</textarea>
        ${renderCoachingSectionHtml(question, answer)}
      </div>

      ${
        detailState.navigationWarning
          ? `<p class="question-nav__warning" role="alert">${escapeHtml(detailState.navigationWarning)}</p>`
          : ''
      }

      <div class="question-nav">
        <button
          class="question-nav__btn question-nav__btn--secondary"
          id="prevQuestionBtn"
          type="button"
          ${isFirst ? 'disabled' : ''}
        >
          이전
        </button>
        ${
          isLast
            ? `
          <button
            class="question-nav__btn question-nav__btn--primary"
            id="finalReviewBtn"
            type="button"
            ${canProceed ? '' : 'disabled'}
          >
            그래프 이야기 작성하기
          </button>
        `
            : `
          <button
            class="question-nav__btn question-nav__btn--primary"
            id="nextQuestionBtn"
            type="button"
            ${canProceed ? '' : 'disabled'}
          >
            다음
          </button>
        `
        }
      </div>
    </section>
  `
}

function renderFinalReviewResultHtml() {
  const { finalStoryReview } = detailState

  if (finalStoryReview.status === 'loading') {
    return `
      <p class="final-writing__result final-writing__result--loading" role="status">
        AI가 그래프 이야기를 점검하는 중...
      </p>
    `
  }

  if (finalStoryReview.status === 'passed') {
    return `
      <p class="final-writing__result final-writing__result--success" role="status">
        ${escapeHtml(finalStoryReview.message).replace(/\n/g, '<br />')}
      </p>
    `
  }

  if (finalStoryReview.status === 'failed') {
    return `
      <p class="final-writing__result final-writing__result--fail" role="alert">
        ${escapeHtml(finalStoryReview.message).replace(/\n/g, '<br />')}
      </p>
    `
  }

  return ''
}

function canPrintFinalStoryPdf() {
  const story = detailState.finalInterpretation.trim()
  const review = detailState.finalStoryReview
  return review.status === 'passed' && review.reviewedStory === story
}

function canRequestStoryReview() {
  const story = detailState.finalInterpretation.trim()
  const review = detailState.finalStoryReview
  return story.length >= 10 && review.status !== 'loading'
}

function renderFinalReviewHtml() {
  const { finalInterpretation } = detailState
  const storyWarning = detailState.finalStoryWarning
    ? `<p class="final-writing__warning" role="alert">${escapeHtml(detailState.finalStoryWarning)}</p>`
    : ''
  const reviewResult = renderFinalReviewResultHtml()
  const canReview = canRequestStoryReview()
  const canPrint = canPrintFinalStoryPdf()

  return `
    <section class="final-review-panel" aria-label="최종 그래프 해석">
      <section class="final-writing" aria-label="그래프 이야기 작성">
        <h3 class="final-writing__title">그래프 이야기 작성</h3>
        <label class="final-writing__label" for="finalInterpretationInput">
          그래프 이야기
        </label>
        <textarea
          class="final-writing__textarea"
          id="finalInterpretationInput"
          rows="10"
          placeholder="예: 시간이 지날수록 이동 거리가 점점 늘어났고, 중간에는 잠시 변화가 거의 없었습니다."
        >${escapeHtml(finalInterpretation)}</textarea>
        <p class="final-writing__guide">
          앞에서 해석한 구간별 변화를 바탕으로 그래프가 나타내는 상황을 자신의 말로 설명해 보세요.
        </p>
        <p class="final-writing__note">이 내용이 이번 그래프 해석 활동의 최종 결과물입니다.</p>
        ${reviewResult}
        ${storyWarning}
      </section>

      <div class="question-nav question-nav--final">
        <button
          class="question-nav__btn question-nav__btn--secondary"
          id="backToLastQuestionBtn"
          type="button"
        >
          이전
        </button>
        <button
          class="question-nav__btn question-nav__btn--primary"
          id="reviewStoryBtn"
          type="button"
          ${canReview ? '' : 'disabled'}
        >
          AI 점검 받기
        </button>
      </div>

      <div class="question-nav question-nav--final question-nav--final-print">
        <button
          class="question-nav__btn question-nav__btn--primary"
          id="printPdfBtn"
          type="button"
          ${canPrint ? '' : 'disabled'}
        >
          제출용 PDF 만들기
        </button>
      </div>
    </section>
  `
}

function renderQuestionsSectionHtml() {
  if (!detailState.questionsStarted) return ''

  if (detailState.showFinalReview) {
    return renderFinalReviewHtml()
  }

  return renderQuestionStepHtml()
}

function renderList() {
  const cards = problems
    .map(
      (problem) => `
        <button class="problem-card" type="button" data-id="${escapeHtml(problem.id)}">
          <span class="problem-card__keyword">
            <span class="problem-card__emoji" aria-hidden="true">${getKeywordEmoji(problem.keyword)}</span>
            ${escapeHtml(problem.keyword)}
          </span>
        </button>
      `,
    )
    .join('')

  return `
    <div class="app-shell">
      <header class="app-header">
        <h1>📊 그래프 해석 학습 도구</h1>
        <p>카드를 눌러 그래프 문제를 살펴보세요</p>
      </header>
      <main class="app-main">
        <h2 class="page-title">그래프 문제 목록</h2>
        <p class="page-subtitle">총 ${problems.length}개의 문제가 있습니다</p>
        ${
          problems.length
            ? `<div class="problem-grid">${cards}</div>`
            : '<p class="empty-state">표시할 문제가 없습니다.</p>'
        }
      </main>
    </div>
  `
}

function renderDetail(problemId) {
  const problem = problems.find((item) => item.id === problemId)

  if (!problem) {
    return `
      <div class="app-shell">
        <header class="app-header">
          <h1>📊 그래프 해석 학습 도구</h1>
        </header>
        <main class="app-main">
          <button class="back-button" type="button" data-nav="list">← 목록으로</button>
          <p class="error-message">문제를 찾을 수 없습니다.</p>
        </main>
      </div>
    `
  }

  const isFinalReview = detailState.showFinalReview
  const background = problem.background?.trim()
  const backgroundSection =
    background && !isFinalReview
      ? `
          <section class="detail-section">
            <span class="detail-section__label">배경</span>
            <p class="detail-section__value">${escapeHtml(background)}</p>
          </section>
        `
      : ''

  const startButtonHidden = detailState.questionsStarted ? ' hidden' : ''

  return `
    <div class="app-shell${isFinalReview ? ' app-shell--final-review' : ''}">
      <header class="app-header">
        <h1>📊 그래프 해석 학습 도구</h1>
        <p>${isFinalReview ? '그래프를 보며 최종 이야기를 작성해 보세요' : '문제 정보를 확인해 보세요'}</p>
      </header>
      <main class="app-main${isFinalReview ? ' app-main--final-review' : ''}">
        <button class="back-button" type="button" data-nav="list">← 목록으로</button>
        <article class="detail-card${isFinalReview ? ' detail-card--above-graph' : ''}">
          <span class="detail-card__keyword">${escapeHtml(problem.keyword)}</span>
          <h2 class="detail-card__title">${escapeHtml(problem.title)}</h2>

          <section class="detail-section">
            <span class="detail-section__label">상황</span>
            <p class="detail-section__value">${escapeHtml(problem.situation)}</p>
          </section>
          ${backgroundSection}
        </article>

        <section class="graph-section" aria-label="그래프">
          <div class="graph-container">
            <canvas id="problemChart"></canvas>
          </div>
        </section>

        <section class="reading-section${isFinalReview ? ' reading-section--final-review' : ''}">
          <button
            class="start-reading-btn"
            id="startReadingBtn"
            type="button"${startButtonHidden}
          >
            그래프 읽기 시작
          </button>
          <div id="questionsSection">${renderQuestionsSectionHtml()}</div>
        </section>
      </main>
    </div>
  `
}

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash) return { view: 'list' }
  return { view: 'detail', id: hash }
}

function saveFinalInterpretation() {
  const textarea = document.querySelector('#finalInterpretationInput')
  if (!textarea) return

  const nextStory = textarea.value
  const previousStory = detailState.finalInterpretation
  detailState.finalInterpretation = nextStory

  if (
    previousStory !== nextStory
    && detailState.finalStoryReview.status !== 'idle'
    && detailState.finalStoryReview.reviewedStory !== nextStory.trim()
  ) {
    detailState.finalStoryReview = createDefaultStoryReviewState()
    detailState.finalStoryWarning = ''
  }
}

function updateFinalReviewControls() {
  const reviewBtn = document.querySelector('#reviewStoryBtn')
  const printBtn = document.querySelector('#printPdfBtn')
  const writingSection = document.querySelector('.final-writing')

  if (reviewBtn) {
    reviewBtn.disabled = !canRequestStoryReview()
  }

  if (printBtn) {
    printBtn.disabled = !canPrintFinalStoryPdf()
  }

  if (!writingSection) return

  writingSection.querySelector('.final-writing__result')?.remove()

  const resultHtml = renderFinalReviewResultHtml()
  if (!resultHtml) return

  const note = writingSection.querySelector('.final-writing__note')
  if (note) {
    note.insertAdjacentHTML('afterend', resultHtml)
  }
}

const PRINT_GRAPH_EXPORT = {
  width: 840,
  height: 440,
}

function getGraphImageDataUrl() {
  if (currentChart && typeof currentChart.toBase64Image === 'function') {
    const container = currentChart.canvas?.parentElement

    if (container instanceof HTMLElement) {
      const prevWidth = container.style.width
      const prevHeight = container.style.height
      const prevMinHeight = container.style.minHeight

      container.style.width = `${PRINT_GRAPH_EXPORT.width}px`
      container.style.height = `${PRINT_GRAPH_EXPORT.height}px`
      container.style.minHeight = `${PRINT_GRAPH_EXPORT.height}px`
      currentChart.resize()
      currentChart.update('none')

      const dataUrl = currentChart.toBase64Image('image/png', 1)

      container.style.width = prevWidth
      container.style.height = prevHeight
      container.style.minHeight = prevMinHeight
      currentChart.resize()
      currentChart.update('none')

      return dataUrl
    }

    return currentChart.toBase64Image('image/png', 1)
  }

  const canvas = document.querySelector('#problemChart')
  if (canvas) {
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return ''
    }
  }

  return ''
}

function populatePrintDocument(problem) {
  saveFinalInterpretation()

  const printRoot = document.querySelector('#printDocument')
  if (!printRoot) return

  const graphImageSrc = getGraphImageDataUrl()
  const emoji = getKeywordEmoji(problem.keyword)
  const keywordLine = emoji ? `${emoji} ${problem.keyword}` : problem.keyword
  const story = detailState.finalInterpretation.trim()
  const graphMarkup = graphImageSrc
    ? `<img class="print-document__graph-img" src="${graphImageSrc}" alt="그래프" />`
    : '<p class="print-document__graph-empty">그래프 이미지를 불러올 수 없습니다.</p>'

  printRoot.innerHTML = `
    <article class="print-document__content">
      <header class="print-document__header">
        <h1 class="print-document__main-title">그래프 해석 학습 결과</h1>
      </header>

      <section class="print-document__section print-document__problem">
        <h2 class="print-document__section-title">학습 문제</h2>
        <p class="print-document__keyword">${escapeHtml(keywordLine)}</p>
        <p class="print-document__title">${escapeHtml(problem.title)}</p>
        <p class="print-document__situation">${escapeHtml(problem.situation)}</p>
      </section>

      <section class="print-document__section print-document__graph">
        <h2 class="print-document__section-title">그래프</h2>
        <div class="print-document__graph-frame">${graphMarkup}</div>
      </section>

      <section class="print-document__section print-document__story">
        <h2 class="print-document__section-title">그래프 이야기</h2>
        <div class="print-document__story-body">${escapeHtml(story)}</div>
      </section>
    </article>
  `

  printRoot.hidden = false
  printRoot.removeAttribute('aria-hidden')
}

function clearPrintDocument() {
  const printRoot = document.querySelector('#printDocument')
  if (!printRoot) return

  printRoot.innerHTML = ''
  printRoot.hidden = true
  printRoot.setAttribute('aria-hidden', 'true')
}

function printSubmissionPdf() {
  const route = getRoute()
  if (route.view !== 'detail' || !detailState.showFinalReview) return

  saveFinalInterpretation()

  if (!canPrintFinalStoryPdf()) {
    if (detailState.finalInterpretation.trim().length < 10) {
      detailState.finalStoryWarning = '그래프 이야기를 작성한 뒤 AI 점검을 받아 주세요.'
    } else if (detailState.finalStoryReview.status !== 'passed') {
      detailState.finalStoryWarning = 'AI 점검을 통과한 뒤 PDF를 만들 수 있습니다.'
    } else {
      detailState.finalStoryWarning = '그래프 이야기를 수정했다면 AI 점검을 다시 받아 주세요.'
    }
    updateQuestionsSection()
    return
  }

  detailState.finalStoryWarning = ''

  const problem = problems.find((item) => item.id === route.id)
  if (!problem) return

  populatePrintDocument(problem)

  const printRoot = document.querySelector('#printDocument')
  const graphImage = printRoot?.querySelector('.print-document__graph-img')

  const runPrint = () => {
    window.print()
  }

  if (graphImage instanceof HTMLImageElement && graphImage.src) {
    if (graphImage.complete) {
      runPrint()
    } else {
      graphImage.addEventListener('load', runPrint, { once: true })
      graphImage.addEventListener('error', runPrint, { once: true })
    }
    return
  }

  runPrint()
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

function setupAutoResizeTextarea(textarea) {
  if (!textarea) return

  const resize = () => autoResizeTextarea(textarea)
  textarea.addEventListener('input', resize)
  resize()
}

function saveCurrentAnswer() {
  const input = document.querySelector('#currentAnswerInput')
  const question = detailState.questions[detailState.currentIndex]
  if (!input || !question) return

  detailState.answers[question.id] = input.value
}

function updateCoachingControls() {
  const input = document.querySelector('#currentAnswerInput')
  const prompt = document.querySelector('.coaching-panel__prompt')
  const question = detailState.questions[detailState.currentIndex]
  if (!input || !question) return

  const hasAnswer = Boolean(input.value.trim())
  const coaching = getCoachingState(question.id)
  const canProceed = canProceedToNextQuestion(coaching)
  const requestBtn = document.querySelector('#requestCoachingBtn')
  const answerBtn = document.querySelector('#showAnswerBtn')
  const nextBtn = document.querySelector('#nextQuestionBtn')
  const finalBtn = document.querySelector('#finalReviewBtn')

  if (requestBtn) {
    requestBtn.disabled = !canRequestCoaching(coaching, hasAnswer)
  } else if (shouldShowCoachingButton(coaching)) {
    updateQuestionsSection()
    return
  }

  if (answerBtn) {
    answerBtn.hidden = !canShowAnswerButton(coaching)
  }

  if (nextBtn) {
    nextBtn.disabled = !canProceed
  }

  if (finalBtn) {
    finalBtn.disabled = !canProceed
  }

  if (prompt) {
    prompt.hidden = hasAnswer
  }
}

async function requestCoachingForCurrentQuestion() {
  const question = detailState.questions[detailState.currentIndex]
  const problem = getCurrentProblem()
  if (!question || !problem) return

  saveCurrentAnswer()
  const studentAnswer = detailState.answers[question.id]?.trim() ?? ''
  if (!studentAnswer) return

  const coaching = getCoachingState(question.id)

  if (!canRequestCoaching(coaching, Boolean(studentAnswer))) {
    return
  }

  coaching.loading = true
  coaching.error = null
  updateQuestionsSection()

  try {
    const response = await requestCoaching({
      problem,
      question,
      studentAnswer,
      hintLevel: coaching.hintLevel,
    })

    coaching.response = response
    coaching.hintLevel = response.hintLevel
    coaching.coachingStepCount += 1
    coaching.coachedAnswer = studentAnswer
    coaching.isAnswerComplete = isCoachingCompleteResponse(response)
    coaching.error = null
  } catch (error) {
    coaching.error = error instanceof Error ? error.message : 'AI 코칭을 불러오지 못했습니다.'
  } finally {
    coaching.loading = false
    updateQuestionsSection()
  }
}

function revealAnswerForCurrentQuestion() {
  const question = detailState.questions[detailState.currentIndex]
  const problem = getCurrentProblem()
  if (!question || !problem) return

  const coaching = getCoachingState(question.id)
  if (!canShowAnswerButton(coaching)) return

  coaching.revealedAnswer = buildReferenceAnswer(problem, question)
  updateQuestionsSection()
}

function handleAnswerEditAfterCoaching(questionId, answerText) {
  const coaching = getCoachingState(questionId)

  if (coaching.revealedAnswer) {
    return
  }

  if (coaching.isAnswerComplete && answerText !== coaching.coachedAnswer) {
    coaching.isAnswerComplete = false
  }
}

function getCurrentAnswerText() {
  const question = detailState.questions[detailState.currentIndex]
  if (!question) return ''

  saveCurrentAnswer()
  return detailState.answers[question.id]?.trim() ?? ''
}

function requireQuestionCompletionBeforeProceeding() {
  const answer = getCurrentAnswerText()
  if (!answer) {
    detailState.navigationWarning = NAVIGATION_ANSWER_REQUIRED_MESSAGE
    updateQuestionsSection()
    return false
  }

  const question = detailState.questions[detailState.currentIndex]
  const coaching = question ? getCoachingState(question.id) : null
  if (!coaching || !canProceedToNextQuestion(coaching)) {
    detailState.navigationWarning = NAVIGATION_COACHING_REQUIRED_MESSAGE
    updateQuestionsSection()
    return false
  }

  detailState.navigationWarning = ''
  return true
}

function updateQuestionsSection() {
  const questionsSection = document.querySelector('#questionsSection')
  if (!questionsSection) return

  questionsSection.innerHTML = renderQuestionsSectionHtml()
  bindQuestionEvents()
}

function applyFinalReviewLayout(isActive) {
  document.querySelector('.app-shell')?.classList.toggle('app-shell--final-review', isActive)
  document.querySelector('.app-main')?.classList.toggle('app-main--final-review', isActive)
  document.querySelector('.detail-card')?.classList.toggle('detail-card--above-graph', isActive)
  document.querySelector('.reading-section')?.classList.toggle('reading-section--final-review', isActive)

  const headerText = document.querySelector('.app-header p')
  if (headerText) {
    headerText.textContent = isActive
      ? '그래프를 보며 최종 이야기를 작성해 보세요'
      : '문제 정보를 확인해 보세요'
  }
}

function render() {
  const app = document.querySelector('#app')
  const route = getRoute()

  destroyProblemChart(currentChart)
  currentChart = null

  if (route.view === 'detail') {
    if (detailState.problemId !== route.id) {
      detailState = createDefaultDetailState(route.id)
    }

    app.innerHTML = renderDetail(route.id)

    const problem = problems.find((item) => item.id === route.id)
    const canvas = document.querySelector('#problemChart')
    if (problem && canvas) {
      currentChart = renderProblemChart(canvas, problem)
    }
  } else {
    detailState = createDefaultDetailState()
    app.innerHTML = renderList()
  }

  bindEvents()
}

function navigateToList() {
  window.location.hash = ''
}

function navigateToDetail(id) {
  window.location.hash = id
}

function startReading(problemId) {
  const problem = problems.find((item) => item.id === problemId)
  if (!problem) return

  detailState.problemId = problemId
  detailState.questionsStarted = true
  detailState.currentIndex = 0
  detailState.showFinalReview = false
  detailState.answers = {}
  detailState.finalInterpretation = ''
  detailState.finalStoryReview = createDefaultStoryReviewState()
  detailState.coachingByQuestion = {}
  detailState.questions = buildQuestions(problem)

  const startButton = document.querySelector('#startReadingBtn')
  if (startButton) {
    startButton.hidden = true
  }

  updateQuestionsSection()
}

function goToPreviousQuestion() {
  if (detailState.showFinalReview) {
    saveFinalInterpretation()
    detailState.showFinalReview = false
    detailState.currentIndex = Math.max(detailState.questions.length - 1, 0)
    updateQuestionsSection()
    applyFinalReviewLayout(false)
    return
  }

  if (detailState.currentIndex === 0) return

  saveCurrentAnswer()
  detailState.currentIndex -= 1
  updateQuestionsSection()
}

function goToNextQuestion() {
  if (detailState.currentIndex >= detailState.questions.length - 1) return
  if (!requireQuestionCompletionBeforeProceeding()) return

  detailState.currentIndex += 1
  detailState.navigationWarning = ''
  updateQuestionsSection()
}

function showFinalReview() {
  if (!requireQuestionCompletionBeforeProceeding()) return

  detailState.showFinalReview = true
  detailState.finalStoryWarning = ''
  detailState.finalStoryReview = createDefaultStoryReviewState()
  detailState.navigationWarning = ''
  updateQuestionsSection()
  applyFinalReviewLayout(true)
}

async function requestStoryReview() {
  const problem = getCurrentProblem()
  if (!problem || !detailState.showFinalReview) return

  saveFinalInterpretation()

  const story = detailState.finalInterpretation.trim()
  if (story.length < 10) {
    detailState.finalStoryWarning = '그래프 이야기를 작성한 뒤 AI 점검을 받아 주세요.'
    updateQuestionsSection()
    return
  }

  detailState.finalStoryReview = {
    status: 'loading',
    message: '',
    reviewedStory: '',
  }
  detailState.finalStoryWarning = ''
  updateQuestionsSection()

  try {
    const result = await requestGraphStoryReview({
      problem,
      questions: detailState.questions,
      story,
    })

    detailState.finalStoryReview = {
      status: result.passed ? 'passed' : 'failed',
      message: result.message,
      reviewedStory: story,
    }
  } catch {
    detailState.finalStoryReview = {
      status: 'failed',
      message:
        '앞에서 해석한 구간별 변화가 충분히 포함되지 않았습니다.\n\n증가, 감소, 변하지 않음 등의 내용을 포함하여 다시 작성해 보세요.',
      reviewedStory: '',
    }
  }

  updateQuestionsSection()
}

function bindQuestionEvents() {
  const input = document.querySelector('#currentAnswerInput')
  if (input) {
    input.addEventListener('input', () => {
      saveCurrentAnswer()
      const question = detailState.questions[detailState.currentIndex]
      if (question) {
        const coaching = getCoachingState(question.id)
        const wasComplete = coaching.isAnswerComplete
        handleAnswerEditAfterCoaching(question.id, input.value)
        if (wasComplete !== coaching.isAnswerComplete) {
          updateQuestionsSection()
          return
        }
      }
      updateCoachingControls()
    })
    setupAutoResizeTextarea(input)
    updateCoachingControls()
  }

  document.querySelector('#requestCoachingBtn')?.addEventListener('click', requestCoachingForCurrentQuestion)
  document.querySelector('#showAnswerBtn')?.addEventListener('click', revealAnswerForCurrentQuestion)

  const finalTextarea = document.querySelector('#finalInterpretationInput')
  if (finalTextarea) {
    finalTextarea.addEventListener('input', () => {
      saveFinalInterpretation()
      updateFinalReviewControls()
    })
    setupAutoResizeTextarea(finalTextarea)
    updateFinalReviewControls()
  }

  document.querySelector('#prevQuestionBtn')?.addEventListener('click', goToPreviousQuestion)
  document.querySelector('#nextQuestionBtn')?.addEventListener('click', goToNextQuestion)
  document.querySelector('#finalReviewBtn')?.addEventListener('click', showFinalReview)
  document.querySelector('#backToLastQuestionBtn')?.addEventListener('click', goToPreviousQuestion)
  document.querySelector('#reviewStoryBtn')?.addEventListener('click', requestStoryReview)
  document.querySelector('#printPdfBtn')?.addEventListener('click', printSubmissionPdf)
}

function bindEvents() {
  document.querySelectorAll('.problem-card').forEach((card) => {
    card.addEventListener('click', () => {
      navigateToDetail(card.dataset.id)
    })
  })

  document.querySelectorAll('[data-nav="list"]').forEach((button) => {
    button.addEventListener('click', navigateToList)
  })

  document.querySelector('#startReadingBtn')?.addEventListener('click', () => {
    const route = getRoute()
    if (route.view === 'detail') {
      startReading(route.id)
    }
  })

  bindQuestionEvents()
}

async function init() {
  const app = document.querySelector('#app')
  app.innerHTML = '<p class="loading">문제를 불러오는 중...</p>'

  try {
    await loadAllData()
    render()
    window.addEventListener('hashchange', render)
    window.addEventListener('afterprint', clearPrintDocument)
  } catch (error) {
    app.innerHTML = `
      <div class="app-shell">
        <header class="app-header">
          <h1>📊 그래프 해석 학습 도구</h1>
        </header>
        <main class="app-main">
          <p class="error-message">${escapeHtml(error.message)}</p>
        </main>
      </div>
    `
  }
}

init()
