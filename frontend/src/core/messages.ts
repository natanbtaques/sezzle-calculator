import type { CalculatorError, ErrorCode } from './types'

const CANNOT_CALCULATE = 'That calculation can’t be done. Clear and try again.'

// Chosen by error code, never by parsing the server's message, so backend wording can change.
// A full Record: every new code must get a message, and server text never reaches the user.
const MESSAGES: Record<ErrorCode, string> = {
  INVALID_JSON: CANNOT_CALCULATE,
  INVALID_INPUT: CANNOT_CALCULATE,
  UNKNOWN_OPERATION: CANNOT_CALCULATE,
  DIVISION_BY_ZERO: 'You can’t divide by zero.',
  NEGATIVE_SQRT: 'Square root needs a number that is zero or greater.',
  // Sent for NaN (e.g. (−8)^0.5) as well as overflow (e.g. 10^400).
  RESULT_NOT_FINITE: 'The result is not a real number or is too large to display.',
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  INVALID_RESPONSE: 'Something went wrong on our side. Please try again.',
}

export function toUserMessage(error: CalculatorError): string {
  return MESSAGES[error.code]
}
