package calculator

import (
	"errors"
	"fmt"
)

// MaxOperands caps expression size to keep requests cheap and bounded.
const MaxOperands = 100

// ErrInvalidExpression reports a structurally invalid expression.
var ErrInvalidExpression = errors.New("invalid expression")

// precedence of the operations allowed inside an expression.
// Higher binds tighter: power > multiply/divide > add/subtract.
var precedence = map[Operation]int{
	Add:      1,
	Subtract: 1,
	Multiply: 2,
	Divide:   2,
	Power:    3,
}

// Evaluate computes an expression such as 5 + 3 × 2, given as
// operands [5, 3, 2] and operators [add, multiply], honouring operator
// precedence (result 11, not 16). Power is right-associative: 2^3^2 = 2^9.
//
// The expression arrives already tokenised, so there is no string parsing:
// the client cannot send malformed syntax, only wrong lengths or operators.
func Evaluate(operands []float64, operators []Operation) (float64, error) {
	if len(operands) == 0 {
		return 0, fmt.Errorf("%w: at least one operand is required", ErrInvalidExpression)
	}
	if len(operands) > MaxOperands {
		return 0, fmt.Errorf("%w: at most %d operands are allowed", ErrInvalidExpression, MaxOperands)
	}
	if len(operators) != len(operands)-1 {
		return 0, fmt.Errorf("%w: expected %d operators for %d operands, got %d",
			ErrInvalidExpression, len(operands)-1, len(operands), len(operators))
	}
	for _, op := range operators {
		if _, ok := precedence[op]; ok {
			continue
		}
		if IsUnary(op) || op == Percentage {
			return 0, fmt.Errorf("%w: operation %q cannot be used in an expression", ErrInvalidExpression, op)
		}
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}

	// Shunting-yard evaluation with two stacks. Each reduction reuses
	// Calculate, so division by zero and overflow are handled in one place.
	values := []float64{operands[0]}
	var ops []Operation

	reduce := func() error {
		n := len(values)
		a, b := values[n-2], values[n-1]
		op := ops[len(ops)-1]
		ops = ops[:len(ops)-1]

		result, err := Calculate(op, a, &b)
		if err != nil {
			return err
		}
		values = append(values[:n-2], result)
		return nil
	}

	for i, op := range operators {
		for len(ops) > 0 && shouldReduceBefore(ops[len(ops)-1], op) {
			if err := reduce(); err != nil {
				return 0, err
			}
		}
		ops = append(ops, op)
		values = append(values, operands[i+1])
	}
	for len(ops) > 0 {
		if err := reduce(); err != nil {
			return 0, err
		}
	}
	return values[0], nil
}

// shouldReduceBefore reports whether the operator on top of the stack must
// be applied before pushing the incoming one.
func shouldReduceBefore(top, incoming Operation) bool {
	pt, pi := precedence[top], precedence[incoming]
	if pt != pi {
		return pt > pi
	}
	// Same precedence: left-associative, except power (right-associative).
	return incoming != Power
}
