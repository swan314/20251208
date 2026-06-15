import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const AXIS_FONT = "'Noto Sans KR', 'Malgun Gothic', sans-serif"
const GRID_COLOR = 'rgba(148, 163, 184, 0.32)'
const AXIS_BORDER_COLOR = 'rgba(100, 116, 139, 0.45)'
const TICK_COLOR = '#334155'

const SERIES_COLORS = [
  { border: '#4f7cff', background: 'rgba(79, 124, 255, 0.2)' },
  { border: '#ff9f43', background: 'rgba(255, 159, 67, 0.2)' },
  { border: '#28c76f', background: 'rgba(40, 199, 111, 0.2)' },
  { border: '#ea5455', background: 'rgba(234, 84, 85, 0.2)' },
]

const LINE_BORDER_WIDTH = 4

function formatAxisTitle(label, unit) {
  const name = label?.trim()
  const unitText = unit?.trim()
  if (!name) return ''
  return unitText ? `${name} (${unitText})` : name
}

function parsePoints(text) {
  const points = []
  const regex = /\(([^,]+),([^)]+)\)/g
  let match = regex.exec(text)

  while (match) {
    points.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
    })
    match = regex.exec(text)
  }

  return points
}

export function parseSeriesFromPoints(pointsStr) {
  const raw = pointsStr?.trim()
  if (!raw) return [{ label: '', points: [] }]

  if (raw.includes(':') && raw.includes(';')) {
    return raw.split(';').filter(Boolean).map((segment) => {
      const colonIndex = segment.indexOf(':')
      const label = segment.slice(0, colonIndex).trim()
      const points = parsePoints(segment.slice(colonIndex + 1))
      return { label, points }
    })
  }

  return [{ label: '', points: parsePoints(raw) }]
}

function parseTick(value) {
  const tick = Number.parseFloat(value)
  if (!Number.isFinite(tick) || tick <= 0) return null
  return tick
}

function getDecimalPlaces(step) {
  if (Number.isInteger(step)) return 0
  const stepText = String(step)
  const dotIndex = stepText.indexOf('.')
  return dotIndex === -1 ? 0 : stepText.length - dotIndex - 1
}

function snapToTick(value, step) {
  const decimals = getDecimalPlaces(step)
  return Number(value.toFixed(decimals))
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function shouldAnchorZero(dataMin, dataMax) {
  if (dataMin <= 0) return true
  if (approxEqual(dataMax, 0)) return true
  if (dataMax <= 0) return true

  // 시간·거리처럼 원점 근처에서 시작하는 데이터만 0을 포함합니다.
  return dataMin <= dataMax * 0.15
}

function isCarouselHeightProblem(problem) {
  return problem.keyword?.trim() === '회전목마'
}

function isTideHeightProblem(problem) {
  return problem.keyword?.trim() === '바다'
}

function shouldAnchorYZero(dataMin, dataMax, problem) {
  if (isCarouselHeightProblem(problem)) return true
  if (isTideHeightProblem(problem)) return true
  return shouldAnchorZero(dataMin, dataMax)
}

function buildCarouselHeightYTicks(yTick) {
  if (!yTick) {
    return { min: undefined, max: undefined, stepSize: undefined }
  }

  const displayMax = 3

  return {
    min: 0,
    max: snapToTick(Math.ceil(displayMax / yTick) * yTick, yTick),
    stepSize: yTick,
  }
}

function computeEducationalAxisBounds(dataMin, dataMax, tick, includeOrigin) {
  if (!tick) {
    return { min: undefined, max: undefined, stepSize: undefined }
  }

  const baseMin = includeOrigin ? Math.min(0, dataMin) : dataMin
  let alignedMin = snapToTick(Math.floor(baseMin / tick) * tick, tick)

  const baseMax = includeOrigin ? Math.max(0, dataMax) : dataMax
  let alignedMax = snapToTick(Math.ceil(baseMax / tick) * tick, tick)

  if (approxEqual(alignedMax, dataMax)) {
    alignedMax = snapToTick(alignedMax + tick, tick)
  }

  if (alignedMax <= alignedMin) {
    alignedMax = snapToTick(alignedMin + tick, tick)
  }

  return {
    min: alignedMin,
    max: alignedMax,
    stepSize: tick,
  }
}

function generateTickValues(min, max, step) {
  const ticks = []
  const count = Math.round((max - min) / step)

  for (let i = 0; i <= count; i += 1) {
    ticks.push(snapToTick(min + i * step, step))
  }

  return ticks
}

function isYearAxis(label, unit) {
  return label?.trim() === '연도' || unit?.trim() === '년'
}

function formatTickLabel(value, step, useIntegerLabels) {
  const snapped = snapToTick(value, step)

  if (useIntegerLabels || (Number.isInteger(step) && step >= 1)) {
    if (!approxEqual(snapped, Math.round(snapped))) return ''
    return String(Math.round(snapped))
  }

  return String(snapped)
}

function buildEducationalAxisTicks(tick, bounds, includeOrigin) {
  return computeEducationalAxisBounds(bounds.min, bounds.max, tick, includeOrigin)
}

function buildEducationalScaleOptions(tickConfig, axisTickStyle, labelOptions = {}) {
  if (!tickConfig.stepSize) {
    return {
      ticks: { ...axisTickStyle },
    }
  }

  const { min, max, stepSize } = tickConfig
  const useIntegerLabels = Boolean(labelOptions.integerLabels)

  return {
    min,
    max,
    ticks: {
      ...axisTickStyle,
      stepSize,
      autoSkip: false,
      maxTicksLimit: 1000,
      includeBounds: false,
      callback: (value) => formatTickLabel(value, stepSize, useIntegerLabels),
    },
    afterBuildTicks: (scale) => {
      scale.ticks = generateTickValues(min, max, stepSize).map((value) => ({ value }))
    },
  }
}

function getSeriesBounds(series) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  series.forEach((item) => {
    item.points.forEach((point) => {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    })
  })

  if (!Number.isFinite(minX)) {
    return null
  }

  return { minX, maxX, minY, maxY }
}

function normalizeGraphType(graphType) {
  const type = (graphType || 'line').trim().toLowerCase()

  if (type === 'compare_curve' || type === 'comparison') return 'comparison'
  if (type === 'curve' || type === 'periodic') return 'curve'
  if (type === 'scatter') return 'scatter'
  return 'line'
}

function buildDatasets(series, graphType) {
  const normalized = normalizeGraphType(graphType)

  return series.map((item, index) => {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]
    const base = {
      label: item.label || undefined,
      data: item.points,
      borderColor: color.border,
      backgroundColor: color.background,
      borderWidth: normalized === 'scatter' ? 0 : LINE_BORDER_WIDTH,
      pointRadius: normalized === 'scatter' ? 7 : 5,
      pointHoverRadius: normalized === 'scatter' ? 7 : 5,
      pointBackgroundColor: color.border,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
    }

    if (normalized === 'scatter') {
      return { ...base, showLine: false }
    }

    if (normalized === 'curve') {
      return {
        ...base,
        showLine: true,
        tension: 0.4,
        cubicInterpolationMode: 'monotone',
        fill: false,
      }
    }

    return { ...base, showLine: true, tension: 0, fill: false }
  })
}

export function renderProblemChart(canvas, problem) {
  const graphType = normalizeGraphType(problem.graphType)
  const series = parseSeriesFromPoints(problem.points)
  const datasets = buildDatasets(series, problem.graphType)
  const bounds = getSeriesBounds(series)
  const xTick = parseTick(problem.xTick)
  const yTick = parseTick(problem.yTick)
  const showLegend = graphType === 'comparison' && series.filter((item) => item.label).length > 1
  const axisTickStyle = {
    font: { size: 14, weight: '500', family: AXIS_FONT },
    color: TICK_COLOR,
    padding: 8,
  }
  const axisGridStyle = {
    color: GRID_COLOR,
    lineWidth: 1,
  }
  const axisBorderStyle = {
    color: AXIS_BORDER_COLOR,
  }
  const anchorXZero = bounds ? shouldAnchorZero(bounds.minX, bounds.maxX) : true
  const anchorYZero = bounds ? shouldAnchorYZero(bounds.minY, bounds.maxY, problem) : true
  const xTicks = bounds && xTick
    ? buildEducationalAxisTicks(xTick, { min: bounds.minX, max: bounds.maxX }, anchorXZero)
    : { stepSize: undefined, min: undefined, max: undefined }
  const yTicks = bounds && yTick
    ? (isCarouselHeightProblem(problem)
      ? buildCarouselHeightYTicks(yTick)
      : buildEducationalAxisTicks(yTick, { min: bounds.minY, max: bounds.maxY }, anchorYZero))
    : { stepSize: undefined, min: undefined, max: undefined }
  const xScaleOptions = buildEducationalScaleOptions(xTicks, axisTickStyle, {
    integerLabels: isYearAxis(problem.xLabel, problem.xUnit),
  })
  const yScaleOptions = buildEducationalScaleOptions(yTicks, axisTickStyle)

  return new Chart(canvas, {
    type: graphType === 'scatter' ? 'scatter' : 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: false,
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top',
          labels: {
            font: { size: 13, family: AXIS_FONT },
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          enabled: false,
        },
      },
      scales: {
        x: {
          type: 'linear',
          ...xScaleOptions,
          title: {
            display: true,
            text: formatAxisTitle(problem.xLabel, problem.xUnit),
            font: { size: 15, weight: '600', family: AXIS_FONT },
            padding: { top: 10 },
            color: TICK_COLOR,
          },
          grid: axisGridStyle,
          border: axisBorderStyle,
        },
        y: {
          type: 'linear',
          ...yScaleOptions,
          title: {
            display: true,
            text: formatAxisTitle(problem.yLabel, problem.yUnit),
            font: { size: 15, weight: '600', family: AXIS_FONT },
            padding: { bottom: 10 },
            color: TICK_COLOR,
          },
          grid: axisGridStyle,
          border: axisBorderStyle,
        },
      },
    },
  })
}

export function destroyProblemChart(chart) {
  if (chart) {
    chart.destroy()
  }
}
