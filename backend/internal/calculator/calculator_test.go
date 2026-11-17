package calculator

import (
	"errors"
	"math"
	"testing"
)

func ptr(f float64) *float64 { return &f }

func TestCalculate(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a       float64
		b       *float64
		want    float64
		wantErr error
	}{
		// Basic operations
		{"add", Add, 2, ptr(3), 5, nil},
		{"add negatives", Add, -2, ptr(-3), -5, nil},
		{"subtract", Subtract, 10, ptr(4), 6, nil},
		{"multiply", Multiply, 6, ptr(7), 42, nil},
		{"multiply by zero", Multiply, 6, ptr(0), 0, nil},
		{"divide", Divide, 10, ptr(4), 2.5, nil},
		{"divide zero by number", Divide, 0, ptr(5), 0, nil},

		// Advanced operations
		{"power", Power, 2, ptr(10), 1024, nil},
		{"power with negative exponent", Power, 2, ptr(-1), 0.5, nil},
		{"sqrt", Sqrt, 16, nil, 4, nil},
		{"sqrt of zero", Sqrt, 0, nil, 0, nil},
		{"sqrt ignores b", Sqrt, 9, ptr(100), 3, nil},
		{"percentage", Percentage, 15, ptr(200), 30, nil},

		// Edge cases
		{"divide by zero", Divide, 1, ptr(0), 0, ErrDivisionByZero},
		{"sqrt of negative", Sqrt, -4, nil, 0, ErrNegativeSqrt},
		{"overflow", Power, 10, ptr(400), 0, ErrNotFinite},
		{"NaN result", Power, -8, ptr(1.0 / 3), 0, ErrNotFinite},
		{"missing operand", Add, 1, nil, 0, ErrMissingOperand},
		{"unknown operation", Operation("modulo"), 1, ptr(2), 0, ErrUnknownOperation},
		{"empty operation", Operation(""), 1, ptr(2), 0, ErrUnknownOperation},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if math.Abs(got-tt.want) > 1e-9 {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsUnary(t *testing.T) {
	for _, op := range Operations() {
		want := op == Sqrt
		if got := IsUnary(op); got != want {
			t.Errorf("IsUnary(%q) = %v, want %v", op, got, want)
		}
	}
}
