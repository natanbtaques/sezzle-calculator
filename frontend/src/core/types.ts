// Mirrors the backend API contract; keep in sync with the Go structs.

export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percentage'

/** Operations that can appear between two numbers in an expression. */
export type BinaryOperator = Extract<Operation, 'add' | 'subtract' | 'multiply' | 'divide' | 'power'>

/** POST /api/v1/calculate — a single operation. */
export interface CalculateRequest {
  operation: Operation
  a: number
  b?: number
}

export interface CalculateResponse {
  operation: Operation
  result: number
}

/** POST /api/v1/evaluate — 33 × 12 + 5 is { operands: [33, 12, 5], operators: ['multiply', 'add'] }. */
export interface EvaluateRequest {
  operands: number[]
  operators: BinaryOperator[]
}

export interface EvaluateResponse {
  result: number
}

export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_INPUT'
  | 'UNKNOWN_OPERATION'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQRT'
  | 'RESULT_NOT_FINITE'
  | 'INTERNAL_ERROR'

/** Errors that only exist on the client side. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'INVALID_RESPONSE'

export type ErrorCode = ApiErrorCode | ClientErrorCode

export interface CalculatorError {
  code: ErrorCode
  message: string
}

/** Either a value or an error: callers must handle both, no try/catch needed. */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: CalculatorError }
