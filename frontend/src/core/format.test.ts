import { describe, expect, it } from 'vitest'
import { formatResult } from './format'

describe('formatResult', () => {
  it.each([
    [5, '5'],
    [-12, '-12'],
    [0, '0'],
    [2.5, '2.5'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [1e21, '1e+21'],
    [1.23456789e-8, '1.234568e-8'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatResult(value)).toBe(expected)
  })
})
