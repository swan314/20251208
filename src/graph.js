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

function computeAlignedAxisBounds(min, max, tick) {
  if (!tick) {
    return { min: undefined, max: undefined }
  }

  const axisMin = Math.min(0, min)
  const axisMax = Math.max(0, max)
  let alignedMin = Math.floor(axisMin / tick) * tick
  let alignedMax = Math.ceil(axisMax / tick) * tick

  if (approxEqual(alignedMin, alignedMax)) {
    alignedMax += tick
  }

  return { min: alignedMin, max: alignedMax }
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6
}

function buildAxisTicks(tick, bounds) {
  const aligned = computeAlignedAxisBounds(bounds.min, bounds.max, tick)

  return {
    stepSize: tick,
    min: aligned.min,
    max: aligned.max,
  }
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
      borderWidth: 2.5,
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
  const xTicks = bounds && xTick
    ? buildAxisTicks(xTick, { min: bounds.minX, max: bounds.maxX })
    : { stepSize: undefined, min: undefined, max: undefined }
  const yTicks = bounds && yTick
    ? buildAxisTicks(yTick, { min: bounds.minY, max: bounds.maxY })
    : { stepSize: undefined, min: undefined, max: undefined }

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
          min: xTicks.min,
          max: xTicks.max,
          title: {
            display: true,
            text: formatAxisTitle(problem.xLabel, problem.xUnit),
            font: { size: 15, weight: '600', family: AXIS_FONT },
            padding: { top: 10 },
            color: TICK_COLOR,
          },
          ticks: {
            ...axisTickStyle,
            stepSize: xTicks.stepSize,
          },
          grid: axisGridStyle,
          border: axisBorderStyle,
        },
        y: {
          type: 'linear',
          min: yTicks.min,
          max: yTicks.max,
          title: {
            display: true,
            text: formatAxisTitle(problem.yLabel, problem.yUnit),
            font: { size: 15, weight: '600', family: AXIS_FONT },
            padding: { bottom: 10 },
            color: TICK_COLOR,
          },
          ticks: {
            ...axisTickStyle,
            stepSize: yTicks.stepSize,
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
