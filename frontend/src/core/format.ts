/** Formats a result for display, hiding floating point noise (0.1 + 0.2). */
export function formatResult(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toString()
  const precise = Number(value.toPrecision(12))
  if (Math.abs(precise) >= 1e15 || (precise !== 0 && Math.abs(precise) < 1e-6)) {
    return precise.toExponential(6).replace(/\.?0+e/, 'e')
  }
  return precise.toString()
}
