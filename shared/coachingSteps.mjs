import {
  formatSeriesNamesAnd,
  formatSeriesNamesWithI,
  withAndParticle,
  withObjectParticle,
  withSubjectParticle,
  withTopicParticle,
} from './koreanParticles.mjs'

/**
 * @param {string} ruleName
 */
export function normalizeCoachingRuleName(ruleName) {
  if (ruleName === 'compare_value') return 'value_compare'
  if (ruleName === 'trend_fact') return 'trend_direction'
  if (ruleName === 'insight_summary' || ruleName === 'feature_summary') return 'summary'
  return ruleName
}

/**
 * @typedef {Object} CoachingStepLabels
 * @property {string} xLabel
 * @property {string} yLabel
 * @property {string} xText
 * @property {string[]} [seriesLabels]
 */

/**
 * @param {string} ruleName
 * @param {CoachingStepLabels} labels
 * @returns {Record<1|2|3, { question: string, hint: string }>}
 */
export function getCoachingSteps(ruleName, labels) {
  const rule = normalizeCoachingRuleName(ruleName)
  const { xLabel, yLabel, xText, seriesLabels = [] } = labels
  const yTopic = withTopicParticle(yLabel)
  const yObject = withObjectParticle(yLabel)
  const ySubject = withSubjectParticle(yLabel)
  const xAnd = withAndParticle(xText)
  const isMultiSeries = seriesLabels.length >= 2
  const subjectsAnd = formatSeriesNamesAnd(seriesLabels)
  const subjectsWithI = formatSeriesNamesWithI(seriesLabels)

  const flows = {
    relation_check: {
      1: {
        question: 'x축과 y축에는 각각 무엇이 표시되어 있나요?',
        hint: '',
      },
      2: {
        question: 'x축과 y축 정보는 어떤 관계를 나타내고 있나요?',
        hint: `가로축은 ${xLabel}, 세로축은 ${yObject} 나타내는지 확인해 보세요.`,
      },
      3: {
        question: `"${xLabel}에 따른 ${yLabel}의 변화" 형태로 설명해 볼까요?`,
        hint: '앞에서 찾은 두 축의 이름을 넣어 한 문장으로 써 보세요.',
      },
    },
    point_value: isMultiSeries
      ? {
          1: {
            question: `${xText}에 해당하는 ${subjectsWithI}의 점을 각각 찾아보세요.`,
            hint: '',
          },
          2: {
            question: `두 사람의 ${xText} 후 ${yLabel}는 각각 얼마인가요?`,
            hint: `${xText}에 해당하는 각각의 점에서 ${yObject} 읽어 보세요.`,
          },
          3: {
            question: `${subjectsWithI}의 ${yObject} 모두 넣어 문장으로 써 보세요.`,
            hint: `${subjectsWithI}의 ${yLabel}와 ${xAnd} 함께 넣어 문장으로 써 보세요. 정답 수치를 그대로 말하지 말고 스스로 표현해 보세요.`,
          },
        }
      : {
          1: {
            question: `${xText}에 해당하는 점을 그래프에서 찾아보세요.`,
            hint: '',
          },
          2: {
            question: `그 점의 ${yTopic} 얼마인가요?`,
            hint: `${xText} 위치의 점을 찾은 뒤, ${yObject} 읽어 보세요.`,
          },
          3: {
            question: '그 점이 의미하는 상황을 문장으로 설명해 볼까요?',
            hint: `${xAnd} ${yObject} 함께 넣어 문장으로 써 보세요. 정답 수치를 그대로 말하지 말고 스스로 표현해 보세요.`,
          },
        },
    value_compare: {
      1: {
        question: '두 값을 각각 그래프에서 찾아보세요.',
        hint: `${xText}에서 각각의 ${yObject} 읽어 보세요.`,
      },
      2: {
        question: '어느 값이 더 큰가요?',
        hint: '같은 위치에서 읽은 두 값을 나란히 비교해 보세요.',
      },
      3: {
        question: '얼마나 차이가 나는지 설명해 볼까요?',
        hint: '더 큰 값과 더 작은 값의 차이를 문장으로 써 보세요.',
      },
    },
    trend_direction: {
      1: {
        question: '전체적으로 증가하나요, 감소하나요?',
        hint: '그래프가 올라가는지, 내려가는지, 또는 변하지 않는지 먼저 보세요.',
      },
      2: {
        question: '처음과 마지막 값을 비교해 보세요.',
        hint: `그래프의 시작과 끝에서 ${ySubject} 어떻게 다른지 확인해 보세요.`,
      },
      3: {
        question: '전체적인 변화를 한 문장으로 설명해 볼까요?',
        hint: `"${withSubjectParticle(xLabel)} 지날수록 ${ySubject} 어떻게 변하는지" 문장으로 써 보세요.`,
      },
    },
    repeat_pattern: {
      1: {
        question: '반복되는 부분이 있나요?',
        hint: '그래프에서 비슷한 모양이나 높이가 다시 나타나는지 보세요.',
      },
      2: {
        question: '같은 값이 다시 나타나나요?',
        hint: `${ySubject} 같은 높이로 돌아오는 부분을 찾아보세요.`,
      },
      3: {
        question: '반복되는 규칙을 설명해 볼까요?',
        hint: '어떤 변화가 주기적으로 반복되는지 문장으로 써 보세요.',
      },
    },
    final_value: isMultiSeries
      ? {
          1: {
            question: `${xText}에 해당하는 ${subjectsAnd}의 점을 각각 찾아보세요.`,
            hint: `${xText}에 해당하는 ${subjectsAnd}의 점을 그래프에서 찾아보세요.`,
          },
          2: {
            question: `${xText} 후 ${subjectsAnd}의 ${yLabel}를 각각 읽어 보세요.`,
            hint: `${xText}에 해당하는 두 점에서 ${yObject} 읽어 보세요.`,
          },
          3: {
            question: `${xText} 후 두 사람의 이동 ${yObject} 문장으로 설명해 보세요.`,
            hint: `${subjectsWithI}의 ${yLabel}와 ${xText}을 함께 넣어 문장으로 써 보세요.`,
          },
        }
      : {
          1: {
            question: '그래프에서 가장 마지막 점은 어디인가요?',
            hint: '그래프의 끝부분 점을 먼저 찾아보세요.',
          },
          2: {
            question: `마지막 점의 ${yTopic} 얼마인가요?`,
            hint: `끝점에서 ${yObject} 읽어 보세요.`,
          },
          3: {
            question: `최종 ${ySubject} 의미하는 상황을 문장으로 설명해 볼까요?`,
            hint: '마지막 값이 무엇을 나타내는지 문장으로 써 보세요.',
          },
        },
    constant_section: {
      1: {
        question: `${ySubject} 변하지 않고 수평으로 이어진 부분이 있나요?`,
        hint: '그래프에서 옆으로 평평하게 이어진 구간을 찾아보세요.',
      },
      2: {
        question: '그 구간에서 값은 얼마로 유지되나요?',
        hint: `수평 구간의 ${yObject} 읽어 보세요.`,
      },
      3: {
        question: '변화가 없는 구간이 무엇을 의미하는지 문장으로 설명해 볼까요?',
        hint: '어느 구간에서 무엇이 변하지 않았는지 문장으로 써 보세요.',
      },
    },
    max_min_value: {
      1: {
        question: `${ySubject} 가장 큰 점과 가장 작은 점을 각각 찾아볼까요?`,
        hint: '그래프에서 가장 높은 점과 가장 낮은 점을 먼저 찾아보세요.',
      },
      2: {
        question: '가장 큰 값과 가장 작은 값은 각각 얼마인가요?',
        hint: `두 점에서 ${yObject} 각각 읽어 보세요.`,
      },
      3: {
        question: '최대값과 최소값의 차이를 문장으로 설명해 볼까요?',
        hint: '가장 큰 값과 작은 값이 무엇인지, 어떻게 다른지 문장으로 써 보세요.',
      },
    },
    summary: {
      1: {
        question: '그래프에서 먼저 눈에 띄는 변화는 무엇인가요?',
        hint: '처음, 중간, 끝 중 어디에서 변화가 큰지 보세요.',
      },
      2: {
        question: '증가·감소·유지 구간을 나누어 볼 수 있나요?',
        hint: `${ySubject} 늘어나는 부분과 변하지 않는 부분을 구분해 보세요.`,
      },
      3: {
        question: '그래프 전체 변화를 한 문장으로 설명해 볼까요?',
        hint: `"${withSubjectParticle(xLabel)} 지날수록 ${ySubject} 어떻게 변하는지" 순서대로 써 보세요.`,
      },
    },
  }

  return flows[rule] ?? flows.point_value
}

/**
 * @param {string} ruleName
 * @param {number} level
 * @param {CoachingStepLabels} labels
 */
export function getCoachingStep(ruleName, level, labels) {
  const steps = getCoachingSteps(ruleName, labels)
  const safeLevel = Math.min(Math.max(Math.trunc(level), 1), 3)
  return steps[safeLevel] ?? steps[1]
}

/**
 * @param {string} ruleName
 * @param {number} nextLevel
 * @param {CoachingStepLabels} labels
 */
export function getCoachingStepGuidanceForPrompt(ruleName, nextLevel, labels) {
  const step = getCoachingStep(ruleName, nextLevel, labels)
  const stageNames = {
    1: '1단계(관찰)',
    2: '2단계(관계 찾기)',
    3: '3단계(문장화·설명)',
  }

  return `${stageNames[nextLevel] ?? '코칭'} 질문 예시: ${step.question}
보조 힌트(필요할 때만): ${step.hint || '(없음)'}`
}
