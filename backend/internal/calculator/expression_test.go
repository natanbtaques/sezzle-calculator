package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestEvaluate(t *testing.T) {
	tests := []struct {
		name      string
		operands  []float64
		operators []Operation
		want      float64
		wantErr   error
	}{
		{"single operand", []float64{42}, nil, 42, nil},
		{"simple multiply", []float64{33, 12}, []Operation{Multiply}, 396, nil},
		{"chained", []float64{33, 12, 4}, []Operation{Multiply, Add}, 400, nil},

		// Precedence
		{"multiply before add", []float64{5, 3, 2}, []Operation{Add, Multiply}, 11, nil},
		{"divide before subtract", []float64{10, 6, 3}, []Operation{Subtract, Divide}, 8, nil},
		{"power before multiply", []float64{2, 3, 2}, []Operation{Multiply, Power}, 18, nil},
		{"mixed", []float64{1, 2, 3, 4, 5}, []Operation{Add, Multiply, Subtract, Divide}, 6.2, nil},

		// Associativity
		{"subtract is left-associative", []float64{10, 4, 3}, []Operation{Subtract, Subtract}, 3, nil},
		{"divide is left-associative", []float64{100, 10, 2}, []Operation{Divide, Divide}, 5, nil},
		{"power is right-associative", []float64{2, 3, 2}, []Operation{Power, Power}, 512, nil},

		{"negative operands", []float64{-2, 2}, []Operation{Power}, 4, nil},
		{"decimals", []float64{0.1, 0.2}, []Operation{Add}, 0.3, nil},

		// Errors from the arithmetic itself
		{"division by zero in the middle", []float64{1, 1, 0, 5}, []Operation{Add, Divide, Add}, 0, ErrDivisionByZero},
		{"overflow", []float64{10, 400}, []Operation{Power}, 0, ErrNotFinite},

		// Structural errors
		{"no operands", nil, nil, 0, ErrInvalidExpression},
		{"too few operators", []float64{1, 2, 3}, []Operation{Add}, 0, ErrInvalidExpression},
		{"too many operators", []float64{1, 2}, []Operation{Add, Add}, 0, ErrInvalidExpression},
		{"unary op not allowed", []float64{1, 2}, []Operation{Sqrt}, 0, ErrInvalidExpression},
		{"percentage not allowed", []float64{1, 2}, []Operation{Percentage}, 0, ErrInvalidExpression},
		{"unknown op", []float64{1, 2}, []Operation{"modulo"}, 0, ErrUnknownOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Evaluate(tt.operands, tt.operators)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if math.Abs(got-tt.want) > 1e-9 {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestEvaluateTooManyOperands(t *testing.T) {
	operands := make([]float64, MaxOperands+1)
	operators := make([]Operation, MaxOperands)
	for i := range operators {
		operators[i] = Add
	}
	if _, err := Evaluate(operands, operators); !errors.Is(err, ErrInvalidExpression) {
		t.Fatalf("error = %v, want ErrInvalidExpression", err)
	}
}

func TestEvaluateMaxOperandsAllowed(t *testing.T) {
	operands := make([]float64, MaxOperands)
	operators := make([]Operation, MaxOperands-1)
	for i := range operands {
		operands[i] = 1
	}
	for i := range operators {
		operators[i] = Add
	}
	got, err := Evaluate(operands, operators)
	if err != nil || got != MaxOperands {
		t.Fatalf("got %v, %v; want %d, nil", got, err, MaxOperands)
	}
}
