import { describe, expect, it } from 'vitest'
import {
  expressionReducer,
  formatExpression,
  initialState,
  MAX_ENTRY_DIGITS,
  selectDisplayValue,
  selectExpressionLine,
  toEvaluateRequest,
  type ExpressionAction,
  type ExpressionState,
} from './expression'
import type { BinaryOperator } from './types'

/** Applies a sequence of actions, like a user pressing keys. */
function press(...actions: ExpressionAction[]): ExpressionState {
  return actions.reduce(expressionReducer, initialState)
}

/** Shorthand: "33*12+" becomes digit/operator actions. */
function keys(sequence: string, from: ExpressionState = initialState): ExpressionState {
  const ops: Record<string, BinaryOperator> = {
    '+': 'add',
    '-': 'subtract',
    '*': 'multiply',
    '/': 'divide',
    '^': 'power',
  }
  return [...sequence].reduce<ExpressionState>((state, ch) => {
    if (/\d/.test(ch)) return expressionReducer(state, { type: 'digit', digit: ch })
    if (ch === '.') return expressionReducer(state, { type: 'decimal' })
    if (ch === '~') return expressionReducer(state, { type: 'negate' })
    if (ch === '<') return expressionReducer(state, { type: 'backspace' })
    return expressionReducer(state, { type: 'operator', operator: ops[ch] })
  }, from)
}

const view = (s: ExpressionState) => ({
  expression: selectExpressionLine(s),
  display: selectDisplayValue(s),
})

describe('typing numbers', () => {
  it('shows 0 initially', () => {
    expect(view(initialState)).toEqual({ expression: '', display: '0' })
  })

  it('builds a multi-digit number', () => {
    expect(view(keys('33'))).toEqual({ expression: '', display: '33' })
  })

  it('replaces a leading zero', () => {
    expect(keys('07').entry).toBe('7')
    expect(keys('0~5').entry).toBe('-5')
  })

  it('handles decimals', () => {
    expect(keys('.5').entry).toBe('0.5')
    expect(keys('3.1.4').entry).toBe('3.14')
    expect(keys('~.').entry).toBe('0.') // negate on empty is a no-op
  })

  it('limits the number of digits', () => {
    expect(keys('9'.repeat(MAX_ENTRY_DIGITS + 5)).entry).toHaveLength(MAX_ENTRY_DIGITS)
  })

  it('toggles the sign', () => {
    expect(keys('5~').entry).toBe('-5')
    expect(keys('5~~').entry).toBe('5')
    expect(keys('~').entry).toBe('') // nothing to negate
  })
})

describe('building an expression', () => {
  it('shows the operator after the first number: 33 ×', () => {
    expect(view(keys('33*'))).toEqual({ expression: '33 ×', display: '33' })
  })

  it('accumulates: 33 × 12 +', () => {
    const state = keys('33*12+')
    expect(view(state)).toEqual({ expression: '33 × 12 +', display: '12' })
    expect(state.operands).toEqual([33, 12])
    expect(state.operators).toEqual(['multiply', 'add'])
  })

  it('replaces the operator when two are pressed in a row', () => {
    expect(selectExpressionLine(keys('33*+'))).toBe('33 +')
  })

  it('ignores an operator before any number', () => {
    expect(keys('+')).toEqual(initialState)
  })

  it('wraps negative operands in parentheses', () => {
    expect(selectExpressionLine(keys('2~^2+'))).toBe('(-2) ^ 2 +')
  })
})

describe('backspace', () => {
  it('removes the last digit', () => {
    expect(keys('123<').entry).toBe('12')
  })

  it('clears a lone minus sign', () => {
    expect(keys('5~<<').entry).toBe('')
  })

  it('removes the pending operator and reopens the previous number', () => {
    const state = keys('33*12+<')
    expect(state.entry).toBe('12')
    expect(selectExpressionLine(state)).toBe('33 ×')
  })

  it('does nothing on an empty calculator', () => {
    expect(keys('<')).toEqual(initialState)
  })
})

describe('toEvaluateRequest', () => {
  it('returns null when there is no operator', () => {
    expect(toEvaluateRequest(keys('42'))).toBeNull()
  })

  it('includes the number being typed', () => {
    expect(toEvaluateRequest(keys('33*12+4'))).toEqual({
      operands: [33, 12, 4],
      operators: ['multiply', 'add'],
    })
  })

  it('drops a dangling operator', () => {
    expect(toEvaluateRequest(keys('33*12+'))).toEqual({
      operands: [33, 12],
      operators: ['multiply'],
    })
  })
})

describe('results', () => {
  const evaluated = expressionReducer(keys('33*12'), {
    type: 'evaluated',
    value: 396,
    expression: '33 × 12 =',
  })

  it('shows the result and the expression that produced it', () => {
    expect(view(evaluated)).toEqual({ expression: '33 × 12 =', display: '396' })
  })

  it('continues from the result with an operator', () => {
    expect(view(keys('+4', evaluated))).toEqual({ expression: '396 +', display: '4' })
  })

  it('starts over when a digit is typed after a result', () => {
    expect(view(keys('7', evaluated))).toEqual({ expression: '', display: '7' })
    expect(keys('.', evaluated).entry).toBe('0.')
  })

  it('cannot backspace a result', () => {
    expect(keys('<', evaluated)).toBe(evaluated)
  })

  it('negates a result', () => {
    expect(selectDisplayValue(keys('~', evaluated))).toBe('-396')
  })

  it('formats long results', () => {
    const state = press({ type: 'evaluated', value: 0.1 + 0.2, expression: '0.1 + 0.2 =' })
    expect(selectDisplayValue(state)).toBe('0.3')
  })
})

describe('unary results (√ and %)', () => {
  const replaced = expressionReducer(
    expressionReducer(keys('10+9'), { type: 'requestStarted' }),
    { type: 'entryReplaced', value: 3 },
  )

  it('replaces only the current number, keeping the expression', () => {
    expect(view(replaced)).toEqual({ expression: '10 +', display: '3' })
    expect(replaced.status).toBe('idle')
  })

  it('a new digit replaces the computed number but keeps the expression', () => {
    expect(view(keys('5', replaced))).toEqual({ expression: '10 +', display: '5' })
  })
})

describe('loading and errors', () => {
  const loading = expressionReducer(keys('1/0'), { type: 'requestStarted' })
  const failed = expressionReducer(loading, { type: 'failed', message: 'nope' })

  it('ignores keys while a request is in flight', () => {
    expect(keys('5+', loading)).toBe(loading)
  })

  it('can still be cleared while loading', () => {
    expect(press({ type: 'clear' })).toEqual(initialState)
    expect(expressionReducer(loading, { type: 'clear' })).toEqual(initialState)
  })

  it('stores the error', () => {
    expect(failed).toMatchObject({ status: 'error', error: 'nope' })
  })

  it('ignores operators and negate after an error', () => {
    expect(keys('+~', failed)).toBe(failed)
  })

  it('starts over on digit or backspace after an error', () => {
    expect(keys('4', failed)).toEqual({ ...initialState, entry: '4' })
    expect(keys('<', failed)).toEqual(initialState)
  })
})

describe('formatExpression', () => {
  it('joins operands and operators', () => {
    expect(formatExpression([1, 2, 3], ['add', 'power'])).toBe('1 + 2 ^ 3')
  })
})
