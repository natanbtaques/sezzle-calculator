package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// decodeTarget has one field per JSON type, so every type-mismatch branch can
// be triggered with a real json.Decoder error.
type decodeTarget struct {
	Number  float64         `json:"n"`
	Pointer *int            `json:"p"`
	String  string          `json:"s"`
	Bool    bool            `json:"b"`
	Slice   []int           `json:"l"`
	Array   [2]int          `json:"a"`
	Object  struct{ X int } `json:"o"`
	Map     map[string]int  `json:"m"`
}

// decodeError decodes body the same way decodeJSON does and returns the error.
func decodeError(t *testing.T, body string) error {
	t.Helper()
	r := http.MaxBytesReader(httptest.NewRecorder(), io.NopCloser(strings.NewReader(body)), maxBodyBytes)
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	var dst decodeTarget
	err := dec.Decode(&dst)
	if err == nil {
		t.Fatalf("decoding %q: expected an error", body)
	}
	return err
}

func TestDescribeDecodeError(t *testing.T) {
	tests := []struct {
		name string
		body string
		err  error // used instead of body when set
		want string
	}{
		{name: "number field", body: `{"n":"1"}`, want: `field "n" must be a number`},
		{name: "pointer to number", body: `{"p":"1"}`, want: `field "p" must be a number`},
		{name: "string field", body: `{"s":1}`, want: `field "s" must be a string`},
		{name: "boolean field", body: `{"b":"yes"}`, want: `field "b" must be a boolean`},
		{name: "slice field", body: `{"l":1}`, want: `field "l" must be an array`},
		{name: "array field", body: `{"a":"x"}`, want: `field "a" must be an array`},
		{name: "struct field", body: `{"o":1}`, want: `field "o" must be an object`},
		{name: "map field", body: `{"m":[]}`, want: `field "m" must be an object`},
		{name: "body is an array", body: `[1,2]`, want: "request body must be a JSON object"},
		{name: "body is a number", body: `42`, want: "request body must be a JSON object"},
		{name: "syntax error", body: `{"s" "x"}`, want: "request body contains malformed JSON (at position 6)"},
		{name: "truncated body", body: `{"s":`, want: "request body contains malformed JSON"},
		{name: "unknown field", body: `{"z":1}`, want: `unknown field "z"`},
		{name: "empty body", body: ``, want: "request body must not be empty"},
		{
			name: "oversized body",
			body: `{"s":"` + strings.Repeat("a", maxBodyBytes) + `"}`,
			want: "request body must not exceed 8192 bytes",
		},
		{name: "unrecognised error", err: errors.New("boom"), want: "request body must be valid JSON"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.err
			if err == nil {
				err = decodeError(t, tt.body)
			}
			if got := describeDecodeError(err); got != tt.want {
				t.Errorf("describeDecodeError() = %q, want %q (raw error: %v)", got, tt.want, err)
			}
		})
	}
}

func TestJSONTypeName(t *testing.T) {
	tests := []struct {
		name string
		typ  reflect.Type
		want string
	}{
		{"float64", reflect.TypeFor[float64](), "a number"},
		{"float32", reflect.TypeFor[float32](), "a number"},
		{"int", reflect.TypeFor[int](), "a number"},
		{"int8", reflect.TypeFor[int8](), "a number"},
		{"int16", reflect.TypeFor[int16](), "a number"},
		{"int32", reflect.TypeFor[int32](), "a number"},
		{"int64", reflect.TypeFor[int64](), "a number"},
		{"uint", reflect.TypeFor[uint](), "a number"},
		{"uint8", reflect.TypeFor[uint8](), "a number"},
		{"uint16", reflect.TypeFor[uint16](), "a number"},
		{"uint32", reflect.TypeFor[uint32](), "a number"},
		{"uint64", reflect.TypeFor[uint64](), "a number"},
		{"pointer to number", reflect.TypeFor[*float64](), "a number"},
		{"pointer to pointer to string", reflect.TypeFor[**string](), "a string"},
		{"string", reflect.TypeFor[string](), "a string"},
		{"bool", reflect.TypeFor[bool](), "a boolean"},
		{"slice", reflect.TypeFor[[]float64](), "an array"},
		{"array", reflect.TypeFor[[3]int](), "an array"},
		{"struct", reflect.TypeFor[CalculateRequest](), "an object"},
		{"map", reflect.TypeFor[map[string]any](), "an object"},
		{"interface", reflect.TypeFor[any](), "a valid value"},
		{"chan", reflect.TypeFor[chan int](), "a valid value"},
		{"func", reflect.TypeFor[func()](), "a valid value"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := jsonTypeName(tt.typ); got != tt.want {
				t.Errorf("jsonTypeName(%v) = %q, want %q", tt.typ, got, tt.want)
			}
		})
	}
}
