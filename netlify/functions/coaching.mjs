import { buildCoachingUserPrompt, parseCoachingResponse, SYSTEM_PROMPT } from '../../shared/coachingPrompt.mjs'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
}

const MAX_ANSWER_LENGTH = 2000
const MAX_QUESTION_LENGTH = 500

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  }
}

function validateContext(body) {
  if (!body || typeof body !== 'object') {
    return '요청 본문이 올바르지 않습니다.'
  }

  const question = String(body.question ?? '').trim()
  const studentAnswer = String(body.studentAnswer ?? '').trim()

  if (!question) return '질문 정보가 없습니다.'
  if (!studentAnswer) return '학생 답변이 없습니다.'
  if (studentAnswer.length > MAX_ANSWER_LENGTH) return '학생 답변이 너무 깁니다.'
  if (question.length > MAX_QUESTION_LENGTH) return '질문 정보가 너무 깁니다.'

  return null
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'POST 요청만 지원합니다.' })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return jsonResponse(500, {
      error: '서버에 OpenAI API Key가 설정되지 않았습니다. Netlify 환경변수 OPENAI_API_KEY를 확인하세요.',
    })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { error: 'JSON 형식이 올바르지 않습니다.' })
  }

  const validationError = validateContext(body)
  if (validationError) {
    return jsonResponse(400, { error: validationError })
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildCoachingUserPrompt(body) },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      return jsonResponse(502, {
        error: 'AI 코칭 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed = parseCoachingResponse(content)

    if (!parsed) {
      return jsonResponse(502, {
        error: 'AI 응답 형식을 이해하지 못했습니다. 다시 시도해 주세요.',
      })
    }

    return jsonResponse(200, parsed)
  } catch (error) {
    console.error('Coaching function error:', error)
    return jsonResponse(500, {
      error: 'AI 코칭 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    })
  }
}
