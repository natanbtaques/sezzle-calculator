// Package api is the HTTP layer: it decodes and validates requests, calls
// the calculator package and encodes JSON responses.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/natanbtaques/sezzle-calculator/backend/internal/calculator"
)

const maxBodyBytes = 8 << 10 // 8 KiB: enough for the largest allowed expression

// CalculateRequest is the body of POST /api/v1/calculate.
// Pointers distinguish a missing field from an explicit zero.
type CalculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b,omitempty"`
}

// CalculateResponse is returned on success.
type CalculateResponse struct {
	Operation string  `json:"operation"`
	Result    float64 `json:"result"`
}

// EvaluateRequest is the body of POST /api/v1/evaluate. The expression
// 33 × 12 + 5 is sent as operands [33, 12, 5], operators [multiply, add].
type EvaluateRequest struct {
	Operands  []float64 `json:"operands"`
	Operators []string  `json:"operators"`
}

// EvaluateResponse is returned on success.
type EvaluateResponse struct {
	Result float64 `json:"result"`
}

// ErrorResponse is returned on any failure. Code is stable and meant for
// programmatic handling; Message is human readable.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error codes exposed to clients.
const (
	CodeInvalidJSON      = "INVALID_JSON"
	CodeInvalidInput     = "INVALID_INPUT"
	CodeUnknownOperation = "UNKNOWN_OPERATION"
	CodeDivisionByZero   = "DIVISION_BY_ZERO"
	CodeNegativeSqrt     = "NEGATIVE_SQRT"
	CodeNotFinite        = "RESULT_NOT_FINITE"
	CodeInternal         = "INTERNAL_ERROR"
)

// NewRouter wires all routes and middleware. allowedOrigin configures CORS
// (e.g. "http://localhost:5173"); an empty value disables CORS headers.
func NewRouter(logger *slog.Logger, allowedOrigin string) http.Handler {
	h := handlers{logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("POST /api/v1/calculate", h.handleCalculate)
	mux.HandleFunc("POST /api/v1/evaluate", h.handleEvaluate)
	return logging(logger, cors(allowedOrigin, mux))
}

// handlers holds what the endpoints need beyond the request itself.
type handlers struct {
	logger *slog.Logger
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h handlers) handleCalculate(w http.ResponseWriter, r *http.Request) {
	var req CalculateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Operation == "" {
		writeError(w, http.StatusBadRequest, CodeInvalidInput, `field "operation" is required`)
		return
	}
	if req.A == nil {
		writeError(w, http.StatusBadRequest, CodeInvalidInput, `field "a" is required`)
		return
	}

	op := calculator.Operation(req.Operation)
	result, err := calculator.Calculate(op, *req.A, req.B)
	if err != nil {
		h.writeCalcError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, CalculateResponse{Operation: req.Operation, Result: result})
}

func (h handlers) handleEvaluate(w http.ResponseWriter, r *http.Request) {
	var req EvaluateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Operands == nil {
		writeError(w, http.StatusBadRequest, CodeInvalidInput, `field "operands" is required`)
		return
	}

	operators := make([]calculator.Operation, len(req.Operators))
	for i, op := range req.Operators {
		operators[i] = calculator.Operation(op)
	}

	result, err := calculator.Evaluate(req.Operands, operators)
	if err != nil {
		h.writeCalcError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, EvaluateResponse{Result: result})
}

// decodeJSON reads a single JSON object into dst, rejecting unknown fields,
// trailing data and oversized bodies. On failure it writes a 400 response
// and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, CodeInvalidJSON, describeDecodeError(err))
		return false
	}
	// Reject trailing data such as `{...}{...}`.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, CodeInvalidJSON, "request body must contain a single JSON object")
		return false
	}
	return true
}

// describeDecodeError turns a json.Decoder error into a client-facing message.
// The raw errors leak Go internals (e.g. "Go struct field CalculateRequest.a
// of type float64"), so each case is rewritten in terms of the JSON payload.
func describeDecodeError(err error) string {
	var (
		syntaxErr  *json.SyntaxError
		typeErr    *json.UnmarshalTypeError
		maxSizeErr *http.MaxBytesError
	)
	switch {
	case errors.As(err, &maxSizeErr):
		return fmt.Sprintf("request body must not exceed %d bytes", maxSizeErr.Limit)
	case errors.As(err, &syntaxErr):
		return fmt.Sprintf("request body contains malformed JSON (at position %d)", syntaxErr.Offset)
	case errors.Is(err, io.ErrUnexpectedEOF):
		return "request body contains malformed JSON"
	case errors.As(err, &typeErr):
		if typeErr.Field == "" {
			return "request body must be a JSON object"
		}
		return fmt.Sprintf("field %q must be %s", typeErr.Field, jsonTypeName(typeErr.Type))
	case errors.Is(err, io.EOF):
		return "request body must not be empty"
	}
	// encoding/json has no typed error for unknown fields; match its message.
	if name, ok := strings.CutPrefix(err.Error(), "json: unknown field "); ok {
		return "unknown field " + name
	}
	return "request body must be valid JSON"
}

// jsonTypeName describes a Go type as the JSON value a client should send.
func jsonTypeName(t reflect.Type) string {
	switch t.Kind() {
	case reflect.Pointer:
		return jsonTypeName(t.Elem())
	case reflect.Float32, reflect.Float64,
		reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "a number"
	case reflect.String:
		return "a string"
	case reflect.Bool:
		return "a boolean"
	case reflect.Slice, reflect.Array:
		return "an array"
	case reflect.Struct, reflect.Map:
		return "an object"
	default:
		return "a valid value"
	}
}

// writeCalcError responds to an error from the calculator package. Unexpected
// errors (500) are logged and replaced by a generic message so internals never
// reach the client.
func (h handlers) writeCalcError(w http.ResponseWriter, r *http.Request, err error) {
	status, code := mapError(err)
	message := err.Error()
	if status == http.StatusInternalServerError {
		h.logger.ErrorContext(r.Context(), "unexpected calculator error",
			"method", r.Method,
			"path", r.URL.Path,
			"error", err,
		)
		message = "internal server error"
	}
	writeError(w, status, code, message)
}

// mapError translates domain errors into HTTP status codes.
// 400: the request itself is malformed. 422: well-formed but mathematically invalid.
func mapError(err error) (int, string) {
	switch {
	case errors.Is(err, calculator.ErrUnknownOperation):
		return http.StatusBadRequest, CodeUnknownOperation
	case errors.Is(err, calculator.ErrMissingOperand),
		errors.Is(err, calculator.ErrInvalidExpression):
		return http.StatusBadRequest, CodeInvalidInput
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, CodeDivisionByZero
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return http.StatusUnprocessableEntity, CodeNegativeSqrt
	case errors.Is(err, calculator.ErrNotFinite):
		return http.StatusUnprocessableEntity, CodeNotFinite
	default:
		return http.StatusInternalServerError, CodeInternal
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, ErrorResponse{Error: ErrorBody{Code: code, Message: message}})
}

// cors allows a single configured origin, which is all the frontend needs.
func cors(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// statusRecorder captures the status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func logging(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration", time.Since(start),
		)
	})
}
