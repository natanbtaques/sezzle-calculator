import { describe, expect, it, vi } from 'vitest'
import { calculate, evaluate } from './api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('evaluate', () => {
  it('posts the expression to /evaluate and returns the result', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ result: 11 }))
    const request = { operands: [5, 3, 2], operators: ['add', 'multiply'] as const }

    const result = await evaluate(
      { operands: request.operands, operators: [...request.operators] },
      { fetchFn },
    )

    expect(result).toEqual({ ok: true, value: 11 })
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operands: [5, 3, 2], operators: ['add', 'multiply'] }),
      signal: undefined,
    })
  })
})

describe('calculate', () => {
  it('posts a single operation to /calculate', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ operation: 'sqrt', result: 3 }))

    expect(await calculate({ operation: 'sqrt', a: 9 }, { fetchFn })).toEqual({ ok: true, value: 3 })
    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/calculate')
  })

  it('uses a custom base URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ result: 1 }))
    await calculate({ operation: 'add', a: 0, b: 1 }, { fetchFn, baseUrl: 'http://api.test/v1' })
    expect(fetchFn.mock.calls[0][0]).toBe('http://api.test/v1/calculate')
  })
})

describe('error handling (shared by both endpoints)', () => {
  it('returns API errors as-is', async () => {
    const error = { code: 'DIVISION_BY_ZERO', message: 'division by zero' }
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error }, 422))

    expect(await evaluate({ operands: [1, 0], operators: ['divide'] }, { fetchFn })).toEqual({
      ok: false,
      error,
    })
  })

  it('maps network failures to NETWORK_ERROR', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await calculate({ operation: 'add', a: 1, b: 1 }, { fetchFn })
    expect(result).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } })
  })

  it('re-throws aborts so callers can ignore them', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(calculate({ operation: 'add', a: 1, b: 1 }, { fetchFn })).rejects.toThrow(
      'Aborted',
    )
  })

  it('handles a non-JSON body (e.g. proxy error page)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    const result = await calculate({ operation: 'add', a: 1, b: 1 }, { fetchFn })
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_RESPONSE', message: 'Unexpected response from server (HTTP 502)' },
    })
  })

  it.each([
    ['success without result', { operation: 'add' }, 200],
    ['result is not a number', { result: '5' }, 200],
    ['error with unknown code', { error: { code: 'WHATEVER', message: 'x' } }, 400],
    ['error without message', { error: { code: 'INVALID_INPUT' } }, 400],
    ['error is not an object', { error: 'oops' }, 400],
    ['body is null', null, 500],
  ])('rejects unexpected shape: %s', async (_name, body, status) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(body, status))
    const result = await calculate({ operation: 'add', a: 1, b: 1 }, { fetchFn })
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } })
  })
})
