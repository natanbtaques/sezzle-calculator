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

  it('falls back to the server message for codes without a custom text', () => {
    expect(toUserMessage({ code: 'INVALID_INPUT', message: 'field "a" is required' })).toBe(
      'field "a" is required',
    )
  })
})
