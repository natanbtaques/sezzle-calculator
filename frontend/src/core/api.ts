import type {
  ApiErrorCode,
  CalculateRequest,
  CalculatorError,
  EvaluateRequest,
  Result,
} from './types'

const DEFAULT_BASE_URL = '/api/v1'

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'INVALID_JSON',
  'INVALID_INPUT',
  'UNKNOWN_OPERATION',
  'DIVISION_BY_ZERO',
  'NEGATIVE_SQRT',
  'RESULT_NOT_FINITE',
  'INTERNAL_ERROR',
]

export interface ApiOptions {
  baseUrl?: string
  signal?: AbortSignal
  /** Injectable for tests and for React Native environments. */
  fetchFn?: typeof fetch
}

/** Single operation, e.g. √9 or 15% of 200. */
export function calculate(request: CalculateRequest, options?: ApiOptions): Promise<Result<number>> {
  return post('/calculate', request, options)
}

/** Whole expression with operator precedence, e.g. 5 + 3 × 2 = 11. */
export function evaluate(request: EvaluateRequest, options?: ApiOptions): Promise<Result<number>> {
  return post('/evaluate', request, options)
}

/**
 * Never throws for expected failures: it returns a Result, so the UI must
 * handle success and error explicitly. Aborts are re-thrown so callers can
 * ignore them.
 */
async function post(
  path: string,
  payload: unknown,
  { baseUrl = DEFAULT_BASE_URL, signal, fetchFn = fetch }: ApiOptions = {},
): Promise<Result<number>> {
  let response: Response
  try {
    response = await fetchFn(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    return failure('NETWORK_ERROR', 'Could not reach the server. Check your connection.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return failure('INVALID_RESPONSE', `Unexpected response from server (HTTP ${response.status})`)
  }

  if (response.ok && hasNumericResult(body)) {
    return { ok: true, value: body.result }
  }
  if (!response.ok && isApiError(body)) {
    return { ok: false, error: body.error }
  }
  return failure('INVALID_RESPONSE', `Unexpected response from server (HTTP ${response.status})`)
}

function failure(code: CalculatorError['code'], message: string): Result<never> {
  return { ok: false, error: { code, message } }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// Runtime guards for data coming from the network.
function hasNumericResult(body: unknown): body is { result: number } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'result' in body &&
    typeof body.result === 'number'
  )
}

function isApiError(body: unknown): body is { error: { code: ApiErrorCode; message: string } } {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false
  const { error } = body
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    API_ERROR_CODES.includes(error.code as ApiErrorCode) &&
    typeof error.message === 'string'
  )
}
