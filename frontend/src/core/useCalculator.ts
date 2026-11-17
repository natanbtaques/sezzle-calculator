import { useCallback, useEffect, useReducer, useRef } from 'react'
import { calculate, evaluate, type ApiOptions } from './api'
import {
  expressionReducer,
  formatExpression,
  initialState,
  selectDisplayValue,
  selectExpressionLine,
  toEvaluateRequest,
} from './expression'
import { toUserMessage } from './messages'
import type { BinaryOperator, Result } from './types'

/** Connects the pure keypad reducer to the API. */
export function useCalculator(options: Omit<ApiOptions, 'signal'> = {}) {
  const [state, dispatch] = useReducer(expressionReducer, initialState)
  const controllerRef = useRef<AbortController | null>(null)

  // Keep the latest state/options available to async callbacks without
  // recreating them on every render.
  const stateRef = useRef(state)
  const optionsRef = useRef(options)
  useEffect(() => {
    stateRef.current = state
    optionsRef.current = options
  })

  // Cancel any in-flight request when the component unmounts.
  useEffect(() => () => controllerRef.current?.abort(), [])

  /** Runs a request, dispatching its outcome unless it was aborted. */
  const run = useCallback(
    async (
      request: (signal: AbortSignal) => Promise<Result<number>>,
      onSuccess: (value: number) => void,
    ) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      dispatch({ type: 'requestStarted' })
      try {
        const result = await request(controller.signal)
        if (result.ok) onSuccess(result.value)
        else dispatch({ type: 'failed', message: toUserMessage(result.error) })
      } catch {
        // Aborted by clear or unmount: nothing to update.
      }
    },
    [],
  )

  const equals = useCallback(() => {
    const current = stateRef.current
    if (current.status !== 'idle') return
    const request = toEvaluateRequest(current)
    if (!request) return

    const expression = `${formatExpression(request.operands, request.operators)} =`
    void run(
      (signal) => evaluate(request, { ...optionsRef.current, signal }),
      (value) => dispatch({ type: 'evaluated', value, expression }),
    )
  }, [run])

  const squareRoot = useCallback(() => {
    const current = stateRef.current
    if (current.status !== 'idle' || current.entry === '') return
    const a = Number(current.entry)
    void run(
      (signal) => calculate({ operation: 'sqrt', a }, { ...optionsRef.current, signal }),
      (value) => dispatch({ type: 'entryReplaced', value }),
    )
  }, [run])

  /**
   * Percent, as on phone calculators: in "200 + 10 %" the 10 becomes 10% of
   * 200 (= 20); otherwise it becomes a fraction (10 % = 0.1).
   */
  const percent = useCallback(() => {
    const current = stateRef.current
    if (current.status !== 'idle' || current.entry === '') return
    const lastOperator = current.operators[current.operators.length - 1]
    const base =
      lastOperator === 'add' || lastOperator === 'subtract'
        ? current.operands[current.operands.length - 1]
        : 1
    const a = Number(current.entry)
    void run(
      (signal) =>
        calculate({ operation: 'percentage', a, b: base }, { ...optionsRef.current, signal }),
      (value) => dispatch({ type: 'entryReplaced', value }),
    )
  }, [run])

  const clear = useCallback(() => {
    controllerRef.current?.abort()
    dispatch({ type: 'clear' })
  }, [])

  const actions = {
    digit: useCallback((digit: string) => dispatch({ type: 'digit', digit }), []),
    decimal: useCallback(() => dispatch({ type: 'decimal' }), []),
    operator: useCallback(
      (operator: BinaryOperator) => dispatch({ type: 'operator', operator }),
      [],
    ),
    negate: useCallback(() => dispatch({ type: 'negate' }), []),
    backspace: useCallback(() => dispatch({ type: 'backspace' }), []),
    clear,
    equals,
    squareRoot,
    percent,
  }

  return {
    expression: selectExpressionLine(state),
    display: selectDisplayValue(state),
    isLoading: state.status === 'loading',
    error: state.error,
    pendingOperator: state.entry === '' ? state.operators.at(-1) ?? null : null,
    ...actions,
  }
}

export type CalculatorController = ReturnType<typeof useCalculator>
