// Package calculator implements the arithmetic, with no knowledge of HTTP or JSON.
package calculator

import (
	"errors"
	"fmt"
	"math"
)

// Operation identifies a supported calculator operation.
type Operation string

const (
	Add        Operation = "add"
	Subtract   Operation = "subtract"
	Multiply   Operation = "multiply"
	Divide     Operation = "divide"
	Power      Operation = "power"
	Sqrt       Operation = "sqrt"
	Percentage Operation = "percentage"
)

// Domain errors. Callers use errors.Is to map them to responses.
var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrMissingOperand   = errors.New("missing operand")
	ErrDivisionByZero   = errors.New("division by zero")
	ErrNegativeSqrt     = errors.New("square root of a negative number")
	ErrNotFinite        = errors.New("result is not a finite number")
)

type binaryFunc func(a, b float64) (float64, error)
type unaryFunc func(a float64) (float64, error)

var binaryOps = map[Operation]binaryFunc{
	Add:      func(a, b float64) (float64, error) { return a + b, nil },
	Subtract: func(a, b float64) (float64, error) { return a - b, nil },
	Multiply: func(a, b float64) (float64, error) { return a * b, nil },
	Divide: func(a, b float64) (float64, error) {
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		return a / b, nil
	},
	Power: func(a, b float64) (float64, error) { return math.Pow(a, b), nil },
	// Percentage returns a% of b, e.g. percentage(15, 200) = 30.
	Percentage: func(a, b float64) (float64, error) { return a / 100 * b, nil },
}

var unaryOps = map[Operation]unaryFunc{
	Sqrt: func(a float64) (float64, error) {
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		return math.Sqrt(a), nil
	},
}

// IsUnary reports whether op takes a single operand.
func IsUnary(op Operation) bool {
	_, ok := unaryOps[op]
	return ok
}

// Operations lists every supported operation.
func Operations() []Operation {
	return []Operation{Add, Subtract, Multiply, Divide, Power, Sqrt, Percentage}
}

// Calculate applies op to the operands. b is a pointer so that an absent
// operand can be told apart from an explicit zero; unary operations ignore it.
func Calculate(op Operation, a float64, b *float64) (float64, error) {
	var (
		result float64
		err    error
	)

	switch {
	case unaryOps[op] != nil:
		result, err = unaryOps[op](a)
	case binaryOps[op] != nil:
		if b == nil {
			return 0, fmt.Errorf("%w: operation %q requires operand b", ErrMissingOperand, op)
		}
		result, err = binaryOps[op](a, *b)
	default:
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}

	if err != nil {
		return 0, err
	}
	// JSON cannot represent NaN or ±Inf (e.g. power(10, 400) overflows).
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrNotFinite
	}
	return result, nil
}
