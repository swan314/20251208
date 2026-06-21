import {
  formatSeriesNamesWithI,
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
 * @property {string} [sectionStartText]
 * @property {string} [sectionEndText]
 * @property {string} [sectionRangeText]
 * @property {string} [yStartText]
 * @property {string} [yEndText]
 * @property {'constant' | 'increase' | 'decrease'} [sectionDirection]
 * @property {boolean} [isMultiSeries]
 */

/**
 * @param {CoachingStepLabels} labels
 */
function buildSectionInterpretationLevel3Help(labels) {
  const {
    yLabel,
    yStartText = '',
    yEndText = '',
    sectionDirection = 'constant',
    isMultiSeries = false,
  } = labels
  const isDistance = yLabel?.trim() === '거리'
  const isSpeed = yLabel?.trim() === '속력'
  const isHeight = yLabel?.trim() === '높이'

  if (isMultiSeries) {
    if (sectionDirection === 'constant') {
      return `두 사람 모두 이 구간에서 ${yLabel}가 변하지 않았습니다.`
    }

    if (isDistance) {
      return `이 구간에서 ${formatSeriesNamesWithI(labels.seriesLabels ?? [])} ${yLabel}가 각각 어떻게 변했는지 따로 문장으로 써 보세요.`
    }

    if (isSpeed) {
      if (sectionDirection === 'increase') {
        return `이 구간에서 두 사람의 ${yLabel}가 모두 증가(빨라짐)했습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
      }

      return `이 구간에서 두 사람의 ${yLabel}가 모두 감소(느려짐)했습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
    }

    if (isHeight) {
      if (sectionDirection === 'increase') {
        return `이 구간에서 두 사람의 ${yLabel}가 모두 높아졌습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
      }

      return `이 구간에서 두 사람의 ${yLabel}가 모두 낮아졌습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
    }

    if (sectionDirection === 'increase') {
      return `이 구간에서 두 사람의 ${yLabel}가 모두 증가했습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
    }

    return `이 구간에서 두 사람의 ${yLabel}가 모두 감소했습니다.\n각각 어떻게 변했는지 문장으로 써 보세요.`
  }

  if (sectionDirection === 'constant') {
    return `두 점의 ${yLabel}가 같으므로\n이 구간에서는 ${yLabel}가 변하지 않았습니다.`
  }

  if (isDistance) {
    return `${withTopicParticle(yLabel)} ${yStartText}에서 ${yEndText}로 이동했습니다.\n이 구간의 변화를 문장으로 써 보세요.`
  }

  if (isSpeed) {
    if (sectionDirection === 'increase') {
      return `${yLabel}가 ${yStartText}에서 ${yEndText}로 증가(빨라짐)했습니다.\n증가했다, 빨라졌다, 늘어났다처럼 써 보세요.`
    }

    return `${yLabel}가 ${yStartText}에서 ${yEndText}로 감소(느려짐)했습니다.\n감소했다, 느려졌다, 줄어들었다처럼 써 보세요.`
  }

  if (isHeight) {
    if (sectionDirection === 'increase') {
      return `${yLabel}가 ${yStartText}에서 ${yEndText}로 높아졌습니다.\n높아졌다, 올라갔다, 상승했다처럼 써 보세요.`
    }

    return `${yLabel}가 ${yStartText}에서 ${yEndText}로 낮아졌습니다.\n낮아졌다, 내려갔다, 하강했다처럼 써 보세요.`
  }

  if (sectionDirection === 'increase') {
    return `${yLabel}가 ${yStartText}에서 ${yEndText}로 증가했습니다.\n이 구간의 변화를 문장으로 써 보세요.`
  }

  return `${yLabel}가 ${yStartText}에서 ${yEndText}로 감소했습니다.\n이 구간의 변화를 문장으로 써 보세요.`
}

/**
 * @param {string} ruleName
 * @param {CoachingStepLabels} labels
 * @returns {Record<1|2|3, { help: string }>}
 */
export function getCoachingSteps(ruleName, labels) {
  const rule = normalizeCoachingRuleName(ruleName)
  const {
    xLabel,
    yLabel,
    xText,
    seriesLabels = [],
    sectionStartText = '',
    sectionEndText = '',
    isMultiSeries = seriesLabels.length >= 2,
  } = labels
  const yTopic = withTopicParticle(yLabel)
  const yObject = withObjectParticle(yLabel)
  const ySubject = withSubjectParticle(yLabel)
  const subjectsWithI = formatSeriesNamesWithI(seriesLabels)

  const flows = {
    relation_check: {
      1: {
        help: '가로축은 무엇을 나타내고,\n세로축은 무엇을 나타내는지 확인해 보세요.',
      },
      2: {
        help: '그래프를 보고 가로축(x축)과 세로축(y축)에 적힌 설명을 찾아보세요.',
      },
      3: {
        help: `가로축은 ${xLabel},\n세로축은 ${yLabel}입니다.\n\n이 두 가지를 이용해 그래프가 무엇을 나타내는지 한 문장으로 써 보세요.`,
      },
    },
    section_interpretation: isMultiSeries
      ? {
          1: {
            help: `${sectionStartText}과 ${sectionEndText}에 해당하는 두 사람의 점을 각각 찾아보세요.`,
          },
          2: {
            help: `${sectionStartText}과 ${sectionEndText}에 ${subjectsWithI} ${yTopic} 각각 얼마인가요?`,
          },
          3: {
            help: buildSectionInterpretationLevel3Help({ ...labels, isMultiSeries: true }),
          },
        }
      : {
          1: {
            help: `${sectionStartText}과 ${sectionEndText}에 해당하는 점을 찾아보세요.`,
          },
          2: {
            help: `${sectionStartText}과 ${sectionEndText}에 해당하는 ${yLabel}는 각각 얼마인가요?`,
          },
          3: {
            help: buildSectionInterpretationLevel3Help(labels),
          },
        },
    summary: {
      1: {
        help: '그래프에서 먼저 눈에 띄는 변화를 찾아보세요.',
      },
      2: {
        help: '증가·감소·유지 구간을 나누어 볼 수 있나요?',
      },
      3: {
        help: `${withSubjectParticle(xLabel)} 지날수록 ${ySubject} 어떻게 변하는지 한 문장으로 써 보세요.`,
      },
    },
    point_value: {
      1: { help: `${xText}에 해당하는 점을 그래프에서 찾아보세요.` },
      2: { help: `그 점의 ${yTopic} 얼마인가요?` },
      3: { help: `${xText}의 ${yObject} 읽고, 그 의미를 문장으로 써 보세요.` },
    },
    value_compare: {
      1: { help: `${xText}에서 두 값을 각각 그래프에서 찾아보세요.` },
      2: { help: '어느 값이 더 큰가요?' },
      3: { help: '두 값의 차이를 문장으로 설명해 보세요.' },
    },
    trend_direction: {
      1: { help: '그래프가 전체적으로 올라가는지, 내려가는지, 또는 변하지 않는지 보세요.' },
      2: { help: `그래프의 처음과 끝 ${yObject} 비교해 보세요.` },
      3: { help: `${withSubjectParticle(xLabel)} 지날수록 ${ySubject} 어떻게 변하는지 문장으로 써 보세요.` },
    },
  }

  return flows[rule] ?? flows.section_interpretation ?? flows.summary
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
 * @param {number} level
 * @param {CoachingStepLabels} labels
 */
export function getCoachingHelp(ruleName, level, labels) {
  return getCoachingStep(ruleName, level, labels).help
}

/**
 * @param {string} ruleName
 * @param {number} nextLevel
 * @param {CoachingStepLabels} labels
 */
export function getCoachingStepGuidanceForPrompt(ruleName, nextLevel, labels) {
  const help = getCoachingHelp(ruleName, nextLevel, labels)
  const stageNames = {
    1: '1차 도움말',
    2: '2차 도움말',
    3: '3차 도움말',
  }

  return `${stageNames[nextLevel] ?? '도움말'} 예시:\n${help}`
}
