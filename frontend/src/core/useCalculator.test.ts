import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCalculator } from './useCalculator'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function setup(fetchFn = vi.fn()) {
  const hook = renderHook(() => useCalculator({ fetchFn }))
  const type = (keys: string) =>
    act(() => {
      for (const k of keys) hook.result.current.digit(k)
    })
  const body = (call = 0) => JSON.parse(fetchFn.mock.calls[call][1].body)
  return { ...hook, fetchFn, type, body }
}

describe('useCalculator', () => {
  it('starts at 0 with no expression', () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ display: '0', expression: '', isLoading: false, error: null })
  })

  it('evaluates the expression on equals', async () => {
    const { result, type, fetchFn, body } = setup(vi.fn().mockResolvedValue(json({ result: 400 })))

    await type('33')
    act(() => result.current.operator('multiply'))
    await type('12')
    act(() => result.current.operator('add'))
    await type('4')
    await act(async () => result.current.equals())

    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/evaluate')
    expect(body()).toEqual({ operands: [33, 12, 4], operators: ['multiply', 'add'] })
    expect(result.current).toMatchObject({ display: '400', expression: '33 × 12 + 4 =' })
  })

  it('does not call the API when there is nothing to evaluate', async () => {
    const { result, type, fetchFn } = setup()
    await type('42')
    await act(async () => result.current.equals())
    expect(fetchFn).not.toHaveBeenCalled()
    expect(result.current.display).toBe('42')
  })

  it('shows loading while waiting and exposes the pending operator', async () => {
    let resolve!: (r: Response) => void
    const { result, type } = setup(vi.fn(() => new Promise<Response>((r) => (resolve = r))))

    await type('1')
    act(() => result.current.operator('add'))
    expect(result.current.pendingOperator).toBe('add')
    await type('1')
    expect(result.current.pendingOperator).toBeNull()

    act(() => result.current.equals())
    expect(result.current.isLoading).toBe(true)

    await act(async () => resolve(json({ result: 2 })))
    expect(result.current).toMatchObject({ isLoading: false, display: '2' })
  })

  it('shows a friendly error message', async () => {
    const { result, type } = setup(
      vi.fn().mockResolvedValue(
        json({ error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' } }, 422),
      ),
    )
    await type('1')
    act(() => result.current.operator('divide'))
    await type('0')
    await act(async () => result.current.equals())

    expect(result.current.error).toBe('You can’t divide by zero.')
  })

  it('computes square root of the current number via /calculate', async () => {
    const { result, type, fetchFn, body } = setup(vi.fn().mockResolvedValue(json({ result: 3 })))
    await type('9')
    await act(async () => result.current.squareRoot())

    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/calculate')
    expect(body()).toEqual({ operation: 'sqrt', a: 9 })
    expect(result.current.display).toBe('3')
  })

  it('percent after + or − is relative to the previous number', async () => {
    const { result, type, body } = setup(vi.fn().mockResolvedValue(json({ result: 20 })))
    await type('200')
    act(() => result.current.operator('add'))
    await type('10')
    await act(async () => result.current.percent())

    expect(body()).toEqual({ operation: 'percentage', a: 10, b: 200 })
    expect(result.current).toMatchObject({ display: '20', expression: '200 +' })
  })

  it('percent otherwise is a plain fraction', async () => {
    const { result, type, body } = setup(vi.fn().mockResolvedValue(json({ result: 0.5 })))
    await type('50')
    await act(async () => result.current.percent())
    expect(body()).toEqual({ operation: 'percentage', a: 50, b: 1 })
  })

  it('ignores √ and % when no number is being typed', async () => {
    const { result, fetchFn } = setup()
    await act(async () => {
      result.current.squareRoot()
      result.current.percent()
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('clear aborts the request in flight and resets', async () => {
    let signal: AbortSignal | undefined
    const { result, type } = setup(
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init!.signal!
        return new Promise<Response>((_, reject) =>
          signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        )
      }),
    )
    await type('9')
    act(() => result.current.squareRoot())
    await act(async () => result.current.clear())

    expect(signal?.aborted).toBe(true)
    expect(result.current).toMatchObject({ display: '0', isLoading: false })
  })

  it('clear while the response body is being read shows no error', async () => {
    const fetchFn = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_, reject) =>
            init!.signal!.addEventListener('abort', () => reject(new Error('body aborted'))),
          ),
      } as unknown as Response),
    )
    const { result, type } = setup(fetchFn)
    await type('9')
    act(() => result.current.squareRoot())
    await act(async () => {}) // let fetch resolve so the body read is pending
    await act(async () => result.current.clear())

    expect(result.current).toMatchObject({ display: '0', isLoading: false, error: null })
  })

  it('never stays loading when the request fails unexpectedly', async () => {
    // A fetch that resolves to nothing makes the client throw outside its own error handling.
    const { result, type } = setup(vi.fn().mockResolvedValue(undefined))
    await type('9')
    await act(async () => result.current.squareRoot())

    expect(result.current).toMatchObject({
      isLoading: false,
      error: 'Something went wrong on our side. Please try again.',
    })
  })

  describe('without a global DOMException (React Native / Hermes)', () => {
    beforeEach(() => vi.stubGlobal('DOMException', undefined))
    afterEach(() => vi.unstubAllGlobals())

    it('shows the network error instead of staying in loading', async () => {
      const { result, type } = setup(vi.fn().mockRejectedValue(new TypeError('Network request failed')))
      await type('9')
      await act(async () => result.current.squareRoot())

      expect(result.current).toMatchObject({
        isLoading: false,
        error: 'Could not reach the server. Check your connection and try again.',
      })
    })
  })

  it('aborts the in-flight request on unmount', async () => {
    let signal: AbortSignal | undefined
    const { result, type, unmount } = setup(
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init!.signal!
        return new Promise<Response>(() => {})
      }),
    )
    await type('9')
    act(() => result.current.squareRoot())
    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('exposes the keypad actions', async () => {
    const { result, type } = setup()
    await type('12')
    act(() => result.current.decimal())
    await type('5')
    act(() => result.current.negate())
    expect(result.current.display).toBe('-12.5')
    act(() => result.current.backspace())
    expect(result.current.display).toBe('-12.')
  })
})
