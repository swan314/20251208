import { parseSeriesFromPoints } from './graph.js'

const EPS = 1e-6

function approxEqual(a, b) {
  return Math.abs(a - b) < EPS
}

function getSeriesList(problem) {
  return parseSeriesFromPoints(problem.points).filter((series) => series.points.length > 0)
}

function getPrimaryPoints(problem) {
  return getSeriesList(problem)[0]?.points ?? []
}

function hasConstantSectionInSeries(points) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    if (next.x > current.x && approxEqual(current.y, next.y)) {
      return true
    }
  }
  return false
}

function detectConstantSection(seriesList) {
  return seriesList.some((series) => hasConstantSectionInSeries(series.points))
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
  if (Math.abs(value) < EPS) return 0
  return value > 0 ? 1 : 2
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) + EPS
    && b.x + EPS >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) + EPS
    && b.y + EPS >= Math.min(a.y, c.y)
  )
}

function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3)
  const o2 = orientation(p1, p2, p4)
  const o3 = orientation(p3, p4, p1)
  const o4 = orientation(p3, p4, p2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p3, p2)) return true
  if (o2 === 0 && onSegment(p1, p4, p2)) return true
  if (o3 === 0 && onSegment(p3, p1, p4)) return true
  if (o4 === 0 && onSegment(p3, p2, p4)) return true
  return false
}

function seriesIntersect(seriesA, seriesB) {
  const pointsA = seriesA.points
  const pointsB = seriesB.points

  for (const pointA of pointsA) {
    for (const pointB of pointsB) {
      if (approxEqual(pointA.x, pointB.x) && approxEqual(pointA.y, pointB.y)) {
        return true
      }
    }
  }

  for (let i = 0; i < pointsA.length - 1; i += 1) {
    for (let j = 0; j < pointsB.length - 1; j += 1) {
      if (segmentsIntersect(pointsA[i], pointsA[i + 1], pointsB[j], pointsB[j + 1])) {
        return true
      }
    }
  }

  return false
}

function detectIntersection(seriesList) {
  if (seriesList.length < 2) return false

  for (let i = 0; i < seriesList.length; i += 1) {
    for (let j = i + 1; j < seriesList.length; j += 1) {
      if (seriesIntersect(seriesList[i], seriesList[j])) {
        return true
      }
    }
  }

  return false
}

function countDirectionChanges(points) {
  let changes = 0

  for (let i = 2; i < points.length; i += 1) {
    const delta1 = points[i - 1].y - points[i - 2].y
    const delta2 = points[i].y - points[i - 1].y

    if (Math.abs(delta1) < EPS || Math.abs(delta2) < EPS) continue
    if ((delta1 > 0 && delta2 < 0) || (delta1 < 0 && delta2 > 0)) {
      changes += 1
    }
  }

  return changes
}

function detectRepetition(points) {
  if (points.length < 4) return false

  const yValues = points.map((point) => point.y)

  for (let period = 2; period <= Math.floor(yValues.length / 2); period += 1) {
    let repeats = true
    for (let i = period; i < yValues.length; i += 1) {
      if (!approxEqual(yValues[i], yValues[i - period])) {
        repeats = false
        break
      }
    }
    if (repeats) return true
  }

  return countDirectionChanges(points) >= 2
}

function findLocalExtrema(points, type) {
  const indices = []

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1].y
    const current = points[i].y
    const next = points[i + 1].y

    if (type === 'max' && current > prev + EPS && current > next + EPS) {
      indices.push(i)
    }
    if (type === 'min' && current < prev - EPS && current < next - EPS) {
      indices.push(i)
    }
  }

  return indices
}

function detectRepeatCycle(points) {
  if (!detectRepetition(points)) return false

  const maxima = findLocalExtrema(points, 'max')
  if (maxima.length >= 2) {
    const cycle = points[maxima[1]].x - points[maxima[0]].x
    return cycle > EPS
  }

  const minima = findLocalExtrema(points, 'min')
  if (minima.length >= 2) {
    const cycle = points[minima[1]].x - points[minima[0]].x
    return cycle > EPS
  }

  if (points.length >= 4) {
    const cycle = points[2].x - points[0].x
    return cycle > EPS
  }

  return false
}

function detectHasMaxValue(points) {
  if (points.length < 2) return false

  const yValues = points.map((point) => point.y)
  const max = Math.max(...yValues)
  const min = Math.min(...yValues)

  if (max - min < EPS) return false

  const maxCount = yValues.filter((value) => approxEqual(value, max)).length
  return maxCount < yValues.length
}

function detectMaxValueSection(points) {
  if (points.length < 2) return false

  const maxY = Math.max(...points.map((point) => point.y))

  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]

    if (
      next.x > current.x
      && approxEqual(current.y, maxY)
      && approxEqual(next.y, maxY)
    ) {
      return true
    }
  }

  return false
}

function detectHasMinMax(points) {
  if (points.length < 2) return false

  const yValues = points.map((point) => point.y)
  const max = Math.max(...yValues)
  const min = Math.min(...yValues)

  return max - min > EPS
}

function detectStopSection(seriesList) {
  return seriesList.some((series) => {
    const points = series.points

    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i]
      const next = points[i + 1]

      if (next.x > current.x && approxEqual(current.y, 0) && approxEqual(next.y, 0)) {
        return true
      }
    }

    return false
  })
}

function detectIncreaseAndDecrease(points) {
  let increasing = false
  let decreasing = false

  for (let i = 0; i < points.length - 1; i += 1) {
    const delta = points[i + 1].y - points[i].y
    if (delta > EPS) increasing = true
    if (delta < -EPS) decreasing = true
  }

  return increasing && decreasing
}

function detectVaryingChangeRate(points) {
  if (points.length < 3) return false

  const slopes = []

  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x
    if (Math.abs(dx) < EPS) continue
    slopes.push((points[i + 1].y - points[i].y) / dx)
  }

  if (slopes.length < 2) return false

  const roundedSlopes = slopes.map((slope) => Math.round(slope * 1000) / 1000)
  return new Set(roundedSlopes).size > 1
}

/** @type {Record<string, (features: ReturnType<typeof analyzeGraphFeatures>) => boolean>} */
const RULE_APPLICABILITY = {
  constant_section: (features) => features.hasConstantSection,
  intersection_point: (features) => features.hasMultipleSeries && features.hasIntersection,
  repeat_pattern: (features) => features.hasRepetition,
  repeat_cycle: (features) => features.hasRepeatCycle,
  repeat_reason: (features) => features.hasRepetition,
  repeat_check: (features) => features.hasRepetition,
  max_value: (features) => features.hasMaxValue,
  max_value_section: (features) => features.hasMaxValueSection,
  max_min_value: (features) => features.hasMinMax,
  stop_section: (features) => features.hasStopSection,
  increase_decrease: (features) => features.hasIncreaseAndDecrease,
  change_rate_compare: (features) => features.hasVaryingChangeRate,
  value_compare: (features) => features.hasMultipleSeries,
  compare_summary: (features) => features.hasMultipleSeries,
}

export function analyzeGraphFeatures(problem) {
  const seriesList = getSeriesList(problem)
  const primaryPoints = seriesList[0]?.points ?? []

  return {
    hasMultipleSeries: seriesList.length >= 2,
    hasConstantSection: detectConstantSection(seriesList),
    hasIntersection: detectIntersection(seriesList),
    hasRepetition: detectRepetition(primaryPoints),
    hasRepeatCycle: detectRepeatCycle(primaryPoints),
    hasMaxValue: detectHasMaxValue(primaryPoints),
    hasMaxValueSection: detectMaxValueSection(primaryPoints),
    hasMinMax: detectHasMinMax(primaryPoints),
    hasStopSection: detectStopSection(seriesList),
    hasIncreaseAndDecrease: detectIncreaseAndDecrease(primaryPoints),
    hasVaryingChangeRate: detectVaryingChangeRate(primaryPoints),
  }
}

export function isRuleApplicable(ruleName, problem) {
  const normalizedRuleName = ruleName?.trim()
  const check = RULE_APPLICABILITY[normalizedRuleName]

  if (!check) return true

  return check(analyzeGraphFeatures(problem))
}
