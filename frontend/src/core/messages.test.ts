import { describe, expect, it } from 'vitest'
import { toUserMessage } from './messages'

describe('toUserMessage', () => {
  it('maps known codes to friendly text', () => {
    expect(toUserMessage({ code: 'DIVISION_BY_ZERO', message: 'division by zero' })).toBe(
      'You can’t divide by zero.',
    )
  })

  it('covers non-real results as well as overflow for RESULT_NOT_FINITE', () => {
    expect(
      toUserMessage({ code: 'RESULT_NOT_FINITE', message: 'result is not a finite number' }),
    ).toBe('The result is not a real number or is too large to display.')
  })

  it.each([
    ['INVALID_JSON', 'request body contains malformed JSON'],
    ['INVALID_INPUT', 'invalid expression: at most 100 operands are allowed'],
    ['UNKNOWN_OPERATION', 'unknown operation: "mod"'],
  ] as const)('shows a user-facing message for %s, never the server text', (code, message) => {
    const text = toUserMessage({ code, message })
    expect(text).toBe('That calculation can’t be done. Clear and try again.')
    expect(text).not.toContain(message)
  })
})
