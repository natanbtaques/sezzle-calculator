package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestRouter() http.Handler {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewRouter(logger, "http://localhost:5173")
}

func TestCalculateEndpoint(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantResult *float64
		wantCode   string
	}{
		{"add", `{"operation":"add","a":2,"b":3}`, 200, f(5), ""},
		{"divide decimals", `{"operation":"divide","a":1,"b":4}`, 200, f(0.25), ""},
		{"explicit zero operand", `{"operation":"multiply","a":5,"b":0}`, 200, f(0), ""},
		{"sqrt without b", `{"operation":"sqrt","a":81}`, 200, f(9), ""},
		{"percentage", `{"operation":"percentage","a":10,"b":50}`, 200, f(5), ""},

		{"division by zero", `{"operation":"divide","a":1,"b":0}`, 422, nil, CodeDivisionByZero},
		{"negative sqrt", `{"operation":"sqrt","a":-1}`, 422, nil, CodeNegativeSqrt},
		{"overflow", `{"operation":"power","a":10,"b":400}`, 422, nil, CodeNotFinite},

		{"unknown operation", `{"operation":"mod","a":1,"b":2}`, 400, nil, CodeUnknownOperation},
		{"missing operation", `{"a":1,"b":2}`, 400, nil, CodeInvalidInput},
		{"missing a", `{"operation":"add","b":2}`, 400, nil, CodeInvalidInput},
		{"missing b", `{"operation":"add","a":2}`, 400, nil, CodeInvalidInput},
		{"string operand", `{"operation":"add","a":"2","b":3}`, 400, nil, CodeInvalidJSON},
		{"malformed json", `{"operation":`, 400, nil, CodeInvalidJSON},
		{"empty body", ``, 400, nil, CodeInvalidJSON},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, 400, nil, CodeInvalidJSON},
		{"trailing data", `{"operation":"add","a":1,"b":2}{}`, 400, nil, CodeInvalidJSON},
		{"body too large", `{"operation":"add","a":1,"b":2,"x":"` + strings.Repeat("a", 10_000) + `"}`, 400, nil, CodeInvalidJSON},
	}

	router := newTestRouter()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}

			if tt.wantResult != nil {
				var resp CalculateResponse
				decode(t, rec, &resp)
				if resp.Result != *tt.wantResult {
					t.Errorf("result = %v, want %v", resp.Result, *tt.wantResult)
				}
				return
			}

			var resp ErrorResponse
			decode(t, rec, &resp)
			if resp.Error.Code != tt.wantCode {
				t.Errorf("error code = %q, want %q", resp.Error.Code, tt.wantCode)
			}
			if resp.Error.Message == "" {
				t.Error("error message should not be empty")
			}
		})
	}
}

// Decode errors must describe the JSON payload, never Go internals such as
// struct names or Go types.
func TestDecodeErrorMessages(t *testing.T) {
	tests := []struct {
		name, path, body, wantMsg string
	}{
		{"string operand", "/api/v1/calculate", `{"operation":"add","a":"2","b":3}`, `field "a" must be a number`},
		{"numeric operation", "/api/v1/calculate", `{"operation":1,"a":2}`, `field "operation" must be a string`},
		// Newer Go versions include the element index in the path ("operands.1").
		{"non-numeric operand in array", "/api/v1/evaluate", `{"operands":[1,"2"],"operators":["add"]}`, `field "operands`},
		{"operands not an array", "/api/v1/evaluate", `{"operands":1,"operators":[]}`, `field "operands" must be an array`},
		{"body is an array", "/api/v1/calculate", `[1,2]`, "request body must be a JSON object"},
		{"unknown field", "/api/v1/calculate", `{"operation":"add","a":1,"c":3}`, `unknown field "c"`},
		{"truncated json", "/api/v1/calculate", `{"operation":`, "request body contains malformed JSON"},
		{"syntax error", "/api/v1/calculate", `{"operation" "add"}`, "request body contains malformed JSON (at position 14)"},
		{"empty body", "/api/v1/calculate", ``, "request body must not be empty"},
		{"body too large", "/api/v1/calculate", `{"x":"` + strings.Repeat("a", 10_000) + `"}`, "request body must not exceed 8192 bytes"},
	}

	router := newTestRouter()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, tt.path, strings.NewReader(tt.body)))

			var resp ErrorResponse
			decode(t, rec, &resp)
			if !strings.HasPrefix(resp.Error.Message, tt.wantMsg) {
				t.Errorf("message = %q, want %q", resp.Error.Message, tt.wantMsg)
			}
			for _, leak := range []string{"Go ", "struct", "Request", "float64", "json:"} {
				if strings.Contains(resp.Error.Message, leak) {
					t.Errorf("message %q leaks internal detail %q", resp.Error.Message, leak)
				}
			}
		})
	}
}

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	decode(t, rec, &body)
	if body["status"] != "ok" {
		t.Errorf("status = %q, want ok", body["status"])
	}
}

func TestMethodNotAllowed(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/calculate", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestCORSPreflight(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/calculate", nil)
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}
}

func TestCORSDisabled(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	rec := httptest.NewRecorder()
	NewRouter(logger, "").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no CORS header, got %q", got)
	}
}

func f(v float64) *float64 { return &v }

func decode(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(v); err != nil {
		t.Fatalf("decoding response: %v (body: %s)", err, rec.Body)
	}
}

func TestEvaluateEndpoint(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantResult *float64
		wantCode   string
	}{
		{"chained expression", `{"operands":[33,12,4],"operators":["multiply","add"]}`, 200, f(400), ""},
		{"respects precedence", `{"operands":[5,3,2],"operators":["add","multiply"]}`, 200, f(11), ""},
		{"single operand", `{"operands":[7],"operators":[]}`, 200, f(7), ""},
		{"single operand without operators field", `{"operands":[7]}`, 200, f(7), ""},

		{"division by zero", `{"operands":[1,0],"operators":["divide"]}`, 422, nil, CodeDivisionByZero},
		{"overflow", `{"operands":[10,400],"operators":["power"]}`, 422, nil, CodeNotFinite},

		{"missing operands", `{"operators":["add"]}`, 400, nil, CodeInvalidInput},
		{"empty operands", `{"operands":[],"operators":[]}`, 400, nil, CodeInvalidInput},
		{"operator count mismatch", `{"operands":[1,2],"operators":[]}`, 400, nil, CodeInvalidInput},
		{"unary operator in expression", `{"operands":[1,2],"operators":["sqrt"]}`, 400, nil, CodeInvalidInput},
		{"unknown operator", `{"operands":[1,2],"operators":["mod"]}`, 400, nil, CodeUnknownOperation},
		{"null operand", `{"operands":[null,5],"operators":["add"]}`, 400, nil, CodeInvalidInput},
		{"null in the middle", `{"operands":[1,null,3],"operators":["add","add"]}`, 400, nil, CodeInvalidInput},
		{"non-numeric operand", `{"operands":[1,"2"],"operators":["add"]}`, 400, nil, CodeInvalidJSON},
		{"unknown field", `{"operands":[1],"operators":[],"x":1}`, 400, nil, CodeInvalidJSON},
	}

	router := newTestRouter()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/evaluate", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantResult != nil {
				var resp EvaluateResponse
				decode(t, rec, &resp)
				if resp.Result != *tt.wantResult {
					t.Errorf("result = %v, want %v", resp.Result, *tt.wantResult)
				}
				return
			}
			var resp ErrorResponse
			decode(t, rec, &resp)
			if resp.Error.Code != tt.wantCode {
				t.Errorf("error code = %q, want %q", resp.Error.Code, tt.wantCode)
			}
		})
	}
}
