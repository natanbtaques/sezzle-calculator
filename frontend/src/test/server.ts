// Mock Service Worker intercepts fetch at the network level, so tests
// exercise the real API client exactly as the app uses it.
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const CALCULATE_URL = '/api/v1/calculate'
export const EVALUATE_URL = '/api/v1/evaluate'

const divisionByZero = () =>
  HttpResponse.json(
    { error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' } },
    { status: 422 },
  )

const apply: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  power: (a, b) => a ** b,
}
const precedence: Record<string, number> = { add: 1, subtract: 1, multiply: 2, divide: 2, power: 3 }

/** A small fake of the Go backend's /evaluate, with operator precedence. */
function fakeEvaluate(operands: number[], operators: string[]): number | 'DIV0' {
  const values = [operands[0]]
  const ops: string[] = []
  const reduce = () => {
    const b = values.pop()!
    const a = values.pop()!
    const op = ops.pop()!
    if (op === 'divide' && b === 0) throw new Error('DIV0')
    values.push(apply[op](a, b))
  }
  try {
    operators.forEach((op, i) => {
      while (
        ops.length &&
        (precedence[ops.at(-1)!] > precedence[op] ||
          (precedence[ops.at(-1)!] === precedence[op] && op !== 'power'))
      ) {
        reduce()
      }
      ops.push(op)
      values.push(operands[i + 1])
    })
    while (ops.length) reduce()
  } catch {
    return 'DIV0'
  }
  return values[0]
}

export const handlers = [
  http.post(EVALUATE_URL, async ({ request }) => {
    const { operands, operators } = (await request.json()) as {
      operands: (number | null)[]
      operators: string[]
    }
    if (!operands.every((n): n is number => typeof n === 'number')) {
      return HttpResponse.json(
        {
          error: { code: 'INVALID_INPUT', message: 'field "operands" must contain only numbers' },
        },
        { status: 400 },
      )
    }
    const result = fakeEvaluate(operands, operators)
    return result === 'DIV0' ? divisionByZero() : HttpResponse.json({ result })
  }),

  http.post(CALCULATE_URL, async ({ request }) => {
    const { operation, a, b = 0 } = (await request.json()) as {
      operation: string
      a: number
      b?: number
    }
    if (operation === 'sqrt') {
      if (a < 0) {
        return HttpResponse.json(
          { error: { code: 'NEGATIVE_SQRT', message: 'square root of a negative number' } },
          { status: 422 },
        )
      }
      return HttpResponse.json({ operation, result: Math.sqrt(a) })
    }
    if (operation === 'percentage') {
      return HttpResponse.json({ operation, result: (a / 100) * b })
    }
    return HttpResponse.json({ operation, result: apply[operation](a, b) })
  }),
]

export const server = setupServer(...handlers)

export { http, HttpResponse }
