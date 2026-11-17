package api

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/natantaques/sezzle-calculator/backend/internal/calculator"
)

func TestMapError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"unknown operation", calculator.ErrUnknownOperation, http.StatusBadRequest, CodeUnknownOperation},
		{"missing operand", calculator.ErrMissingOperand, http.StatusBadRequest, CodeInvalidInput},
		{"invalid expression", calculator.ErrInvalidExpression, http.StatusBadRequest, CodeInvalidInput},
		{"division by zero", calculator.ErrDivisionByZero, http.StatusUnprocessableEntity, CodeDivisionByZero},
		{"negative sqrt", calculator.ErrNegativeSqrt, http.StatusUnprocessableEntity, CodeNegativeSqrt},
		{"not finite", calculator.ErrNotFinite, http.StatusUnprocessableEntity, CodeNotFinite},
		{"wrapped domain error", fmt.Errorf("step 2: %w", calculator.ErrDivisionByZero), http.StatusUnprocessableEntity, CodeDivisionByZero},
		{"unknown error", errors.New("something unexpected"), http.StatusInternalServerError, CodeInternal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code := mapError(tt.err)
			if status != tt.wantStatus || code != tt.wantCode {
				t.Errorf("mapError() = (%d, %q), want (%d, %q)", status, code, tt.wantStatus, tt.wantCode)
			}
		})
	}
}

func TestWriteCalcErrorHidesInternalErrors(t *testing.T) {
	const secret = "db password=hunter2 at /srv/internal/calc.go:42"

	var logs bytes.Buffer
	h := handlers{logger: slog.New(slog.NewTextHandler(&logs, nil))}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", nil)

	h.writeCalcError(rec, req, errors.New(secret))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	var resp ErrorResponse
	decode(t, rec, &resp)
	if resp.Error.Code != CodeInternal {
		t.Errorf("code = %q, want %q", resp.Error.Code, CodeInternal)
	}
	if resp.Error.Message != "internal server error" {
		t.Errorf("message = %q, want %q", resp.Error.Message, "internal server error")
	}
	if strings.Contains(rec.Body.String(), "hunter2") {
		t.Errorf("response body leaks the original error: %s", rec.Body.String())
	}
	// The detail must still reach the operator through the logs.
	if !strings.Contains(logs.String(), "hunter2") || !strings.Contains(logs.String(), "/api/v1/calculate") {
		t.Errorf("log does not record the error and path: %s", logs.String())
	}
}

func TestWriteCalcErrorKeepsDomainMessages(t *testing.T) {
	var logs bytes.Buffer
	h := handlers{logger: slog.New(slog.NewTextHandler(&logs, nil))}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", nil)

	h.writeCalcError(rec, req, calculator.ErrDivisionByZero)

	var resp ErrorResponse
	decode(t, rec, &resp)
	if rec.Code != http.StatusUnprocessableEntity || resp.Error.Message != calculator.ErrDivisionByZero.Error() {
		t.Errorf("got %d %q, want %d %q", rec.Code, resp.Error.Message,
			http.StatusUnprocessableEntity, calculator.ErrDivisionByZero.Error())
	}
	if logs.Len() != 0 {
		t.Errorf("expected domain errors not to be logged, got: %s", logs.String())
	}
}
