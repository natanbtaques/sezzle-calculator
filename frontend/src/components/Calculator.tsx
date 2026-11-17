import { useEffect, useRef, type ReactNode } from 'react'
import { OPERATOR_LABELS, OPERATOR_SYMBOLS } from '../core/operations'
import type { BinaryOperator } from '../core/types'
import { useCalculator, type CalculatorController } from '../core/useCalculator'
import './Calculator.css'

export function Calculator() {
  const calc = useCalculator()
  useKeyboardShortcuts(calc)

  return (
    <section className="calculator" aria-label="Calculator">
      <Display expression={calc.expression} value={calc.display} error={calc.error} />
      <Keypad calc={calc} />
    </section>
  )
}

interface DisplayProps {
  expression: string
  value: string
  error: string | null
}

function Display({ expression, value, error }: DisplayProps) {
  return (
    <div className="display">
      <div className="display__expression" data-testid="expression">
        {expression}
      </div>
      <output className="display__value" data-testid="display" aria-live="polite">
        {error ? (
          <span className="display__error" role="alert">
            {error}
          </span>
        ) : (
          value
        )}
      </output>
    </div>
  )
}

function Keypad({ calc }: { calc: CalculatorController }) {
  const disabled = calc.isLoading

  const op = (operator: BinaryOperator) => (
    <Key
      label={OPERATOR_LABELS[operator]}
      variant="operator"
      active={calc.pendingOperator === operator}
      disabled={disabled}
      onPress={() => calc.operator(operator)}
    >
      {OPERATOR_SYMBOLS[operator]}
    </Key>
  )
  const digit = (d: string, className?: string) => (
    <Key label={d} disabled={disabled} onPress={() => calc.digit(d)} className={className}>
      {d}
    </Key>
  )

  return (
    <div className="keypad" aria-busy={disabled}>
      <Key label="Clear" variant="function" onPress={calc.clear}>
        C
      </Key>
      <Key label="Backspace" variant="function" disabled={disabled} onPress={calc.backspace}>
        ⌫
      </Key>
      <Key label="Toggle sign" variant="function" disabled={disabled} onPress={calc.negate}>
        ±
      </Key>
      {op('divide')}

      <Key label="Square root" variant="function" disabled={disabled} onPress={calc.squareRoot}>
        √
      </Key>
      {op('power')}
      <Key label="Percent" variant="function" disabled={disabled} onPress={calc.percent}>
        %
      </Key>
      {op('multiply')}

      {digit('7')}
      {digit('8')}
      {digit('9')}
      {op('subtract')}

      {digit('4')}
      {digit('5')}
      {digit('6')}
      {op('add')}

      {digit('1')}
      {digit('2')}
      {digit('3')}
      <Key
        label="Equals"
        variant="equals"
        className="key--equals"
        disabled={disabled}
        onPress={calc.equals}
      >
        {calc.isLoading ? '…' : '='}
      </Key>

      {digit('0', 'key--zero')}
      <Key label="Decimal point" disabled={disabled} onPress={calc.decimal}>
        .
      </Key>
    </div>
  )
}

interface KeyProps {
  label: string
  children: ReactNode
  onPress: () => void
  variant?: 'digit' | 'operator' | 'function' | 'equals'
  active?: boolean
  disabled?: boolean
  className?: string
}

function Key({ label, children, onPress, variant = 'digit', active, disabled, className }: KeyProps) {
  return (
    <button
      type="button"
      className={`key key--${variant} ${active ? 'key--active' : ''} ${className ?? ''}`}
      aria-label={label}
      aria-pressed={variant === 'operator' ? Boolean(active) : undefined}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  )
}

/** Physical keyboard support (web only, so it lives outside core/). */
function useKeyboardShortcuts(calc: CalculatorController) {
  // A ref lets the listener be attached once and still see the latest actions.
  const calcRef = useRef(calc)
  useEffect(() => {
    calcRef.current = calc
  })

  useEffect(() => {
    const operatorKeys: Record<string, BinaryOperator> = {
      '+': 'add',
      '-': 'subtract',
      '*': 'multiply',
      x: 'multiply',
      '/': 'divide',
      '^': 'power',
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const { key } = event
      const calc = calcRef.current

      let handled = true
      if (/^[0-9]$/.test(key)) calc.digit(key)
      else if (key === '.' || key === ',') calc.decimal()
      else if (key in operatorKeys) calc.operator(operatorKeys[key])
      else if (key === 'Enter' || key === '=') calc.equals()
      else if (key === 'Backspace') calc.backspace()
      else if (key === 'Escape' || key === 'Delete') calc.clear()
      else if (key === '%') calc.percent()
      else handled = false

      // Enter on a focused button would also "click" it: prevent double input.
      if (handled) event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
