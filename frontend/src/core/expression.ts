// Pure keypad state machine: (state, action) => state. Never does arithmetic.

import { formatResult } from './format'
import { OPERATOR_SYMBOLS } from './operations'
import type { BinaryOperator, EvaluateRequest } from './types'

/** Longest number the user can type, to keep the display readable. */
export const MAX_ENTRY_DIGITS = 15

export interface ExpressionState {
  /** Numbers already committed, e.g. 33 and 12 in "33 × 12 + ". */
  operands: number[]
  /** Operators between them; always operands.length or operands.length - 1 long. */
  operators: BinaryOperator[]
  /** The number currently being typed (or a computed value), as text. */
  entry: string
  /** True when entry holds a computed value: typing a digit replaces it. */
  entryIsResult: boolean
  /** The expression that produced the current result, e.g. "33 × 12 =". */
  history: string | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
}

export type ExpressionAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: BinaryOperator }
  | { type: 'negate' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'requestStarted' }
  | { type: 'evaluated'; value: number; expression: string }
  | { type: 'entryReplaced'; value: number }
  | { type: 'failed'; message: string }

export const initialState: ExpressionState = {
  operands: [],
  operators: [],
  entry: '',
  entryIsResult: false,
  history: null,
  status: 'idle',
  error: null,
}

export function expressionReducer(state: ExpressionState, action: ExpressionAction): ExpressionState {
  // While a request is in flight, only its outcome (or clear) may change the state.
  if (state.status === 'loading' && !isRequestOutcome(action) && action.type !== 'clear') {
    return state
  }

  switch (action.type) {
    case 'digit': {
      const base = startFreshIfNeeded(state)
      if (base.entry === '0') return { ...base, entry: action.digit }
      if (base.entry === '-0') return { ...base, entry: `-${action.digit}` }
      if (countDigits(base.entry) >= MAX_ENTRY_DIGITS) return base
      return { ...base, entry: base.entry + action.digit }
    }

    case 'decimal': {
      const base = startFreshIfNeeded(state)
      if (base.entry.includes('.')) return base
      const prefix = base.entry === '' || base.entry === '-' ? `${base.entry}0` : base.entry
      return { ...base, entry: `${prefix}.` }
    }

    case 'operator': {
      if (state.status === 'error') return state
      const base = { ...state, history: null }

      if (base.entry === '') {
        // "33 ×" then "+": swap the pending operator.
        if (base.operators.length === 0) return base
        return { ...base, operators: [...base.operators.slice(0, -1), action.operator] }
      }
      return {
        ...base,
        operands: [...base.operands, Number(base.entry)],
        operators: [...base.operators, action.operator],
        entry: '',
        entryIsResult: false,
      }
    }

    case 'negate': {
      if (state.status === 'error' || state.entry === '') return state
      const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`
      return { ...state, entry: state.entryIsResult ? String(-Number(state.entry)) : entry }
    }

    case 'backspace': {
      if (state.status === 'error') return initialState
      if (state.entryIsResult) return state
      if (state.entry !== '') {
        const entry = state.entry.slice(0, -1)
        return { ...state, entry: entry === '-' ? '' : entry }
      }
      // Nothing typed: remove the last operator and reopen the previous number.
      if (state.operators.length > 0) {
        const last = state.operands[state.operands.length - 1]
        return {
          ...state,
          operands: state.operands.slice(0, -1),
          operators: state.operators.slice(0, -1),
          entry: String(last),
        }
      }
      return state
    }

    case 'clear':
      return initialState

    case 'requestStarted':
      return { ...state, status: 'loading', error: null }

    case 'evaluated':
      return {
        ...initialState,
        entry: String(action.value),
        entryIsResult: true,
        history: action.expression,
      }

    case 'entryReplaced':
      return {
        ...state,
        status: 'idle',
        entry: String(action.value),
        entryIsResult: true,
        history: null,
      }

    case 'failed':
      return { ...state, status: 'error', error: action.message }
  }
}

function isRequestOutcome(action: ExpressionAction): boolean {
  return action.type === 'evaluated' || action.type === 'entryReplaced' || action.type === 'failed'
}

/** After a result or an error, typing a digit starts a new number. */
function startFreshIfNeeded(state: ExpressionState): ExpressionState {
  if (state.status === 'error') return initialState
  if (state.entryIsResult) {
    // After "=" a new number starts a new expression; after √ or % it only replaces the entry.
    return state.history !== null ? initialState : { ...state, entry: '', entryIsResult: false }
  }
  return state
}

function countDigits(entry: string): number {
  return entry.replace(/[^0-9]/g, '').length
}

// ---------- Derived values (selectors) ----------

/** The request to send when "=" is pressed, or null if there is nothing to evaluate. */
export function toEvaluateRequest(state: ExpressionState): EvaluateRequest | null {
  if (state.operators.length === 0) return null

  // "33 × 12 +" then "=": ignore the dangling operator.
  if (state.entry === '') {
    return { operands: state.operands, operators: state.operators.slice(0, -1) }
  }
  return {
    operands: [...state.operands, Number(state.entry)],
    operators: state.operators,
  }
}

/** Human-readable expression, e.g. "33 × 12 +". */
export function formatExpression(operands: number[], operators: BinaryOperator[]): string {
  const parts: string[] = []
  operands.forEach((operand, i) => {
    parts.push(formatOperand(operand))
    if (i < operators.length) parts.push(OPERATOR_SYMBOLS[operators[i]])
  })
  return parts.join(' ')
}

/** What the small line above the main number shows. */
export function selectExpressionLine(state: ExpressionState): string {
  if (state.history !== null) return state.history
  return formatExpression(state.operands, state.operators)
}

/** What the big main number shows. */
export function selectDisplayValue(state: ExpressionState): string {
  // Between "33 ×" and the next number, keep showing the last number typed.
  if (state.entry === '') {
    const last = state.operands[state.operands.length - 1]
    return last === undefined ? '0' : formatResult(last)
  }
  if (state.entryIsResult) return formatResult(Number(state.entry))
  return state.entry
}

function formatOperand(value: number): string {
  const text = formatResult(value)
  return value < 0 ? `(${text})` : text
}
