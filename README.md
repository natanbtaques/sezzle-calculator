# Sezzle Calculator

[![CI](https://github.com/natanbtaques/sezzle-calculator/actions/workflows/ci.yml/badge.svg)](https://github.com/natanbtaques/sezzle-calculator/actions/workflows/ci.yml)

Full-stack calculator: a **React + TypeScript** frontend that works like a phone calculator,
and a **Go** REST microservice that does all the arithmetic. It supports `+ − × ÷`, power,
square root, percentage and chained expressions with precedence (`5 + 3 × 2 = 11`).

## Running

**With Docker:**

```bash
docker compose up --build
```

Open http://localhost:3000.

**Without Docker** (Go 1.24+ and Node 22.19+):

```bash
cd backend && go run ./cmd/server          # API on :8080
cd frontend && npm install && npm run dev  # app on :5173, proxies /api to :8080
```

The keypad also works with the keyboard: digits, `+ - * / ^`, `%`, Enter, Backspace and Esc.

## Tests

```bash
cd backend && go test ./... -cover
cd frontend && npm run coverage
```

CI runs formatting, vet, lint, typecheck, all tests with coverage and a Docker smoke test on
every push to main and on every pull request. Coverage reports are attached to each run as artifacts.

## API

**`POST /api/v1/evaluate`**: full expression with operator precedence.

```bash
curl -X POST localhost:8080/api/v1/evaluate -H "Content-Type: application/json" \
  -d '{"operands":[33,12,4],"operators":["multiply","add"]}'
# {"result":400}
```

**`POST /api/v1/calculate`**: a single operation (`add`, `subtract`, `multiply`, `divide`,
`power`, `percentage` = a% of b, `sqrt`, which uses only `a`).

```bash
curl -X POST localhost:8080/api/v1/calculate -H "Content-Type: application/json" \
  -d '{"operation":"sqrt","a":9}'
# {"operation":"sqrt","result":3}
```

**`GET /health`** returns `{"status":"ok"}`.

**Errors** always look like `{"error":{"code":"DIVISION_BY_ZERO","message":"division by zero"}}`.

| Status | Codes | Meaning |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_INPUT`, `UNKNOWN_OPERATION` | The request is malformed |
| 422 | `DIVISION_BY_ZERO`, `NEGATIVE_SQRT`, `RESULT_NOT_FINITE` | Valid request, impossible math |
| 500 | `INTERNAL_ERROR` | Unexpected failure (logged, details never returned) |

## Structure

```
backend/internal/calculator   pure arithmetic and precedence (no HTTP)
backend/internal/api          HTTP: decoding, validation, error mapping
frontend/src/core             platform-agnostic logic (no DOM): reducer, API client, hook
frontend/src/components       web UI
```

## Design decisions

- **The backend is the source of truth.** The frontend never computes; it only builds the
  expression and shows the API's result.
- **Expressions are sent as tokens** (`operands` + `operators`), not as a string, so the
  backend never parses text and syntax errors cannot happen.
- **Precedence uses the shunting-yard algorithm** (two stacks). Each step reuses
  `Calculate`, so division by zero and overflow are handled in one place.
- **Pure logic is separated from I/O on both sides.** In Go, `calculator` knows nothing about
  HTTP. In the frontend, `core/` has no DOM dependency: the keypad is a pure reducer, tested
  without rendering, and reusable in React Native.
- **A reducer instead of several `useState` calls**, because one key press changes several
  fields at once and each transition should be atomic.
- **The API client returns `Result<T>` instead of throwing**, validates network data at
  runtime and picks user messages by error code.
- **Go standard library only**, and a single origin (Vite proxy in dev, nginx in Docker),
  so CORS is not needed.
- **Responsive and accessible.** On phone-sized touch screens the calculator fills the
  screen like a native app; keys are at least 48 px, and results and errors are announced to screen
  readers with `aria-live`.

**Assumptions:** numbers are `float64`; `%` follows phone calculators (`200 + 10%` → `200 + 20`);
parentheses are out of scope.

## Use of AI

I used Claude (chat and Claude Code) throughout, as allowed. Prompts and the changes I made
after reviewing the output are in [PROMPTS.md](PROMPTS.md); project conventions for Claude
Code are in [CLAUDE.md](CLAUDE.md).

<!-- TODO: time spent -->
Time spent: about X hours, plus time learning Go, which I had not used before.

## With more time

End-to-end tests with Playwright, a React Native client reusing `frontend/src/core`,
parentheses, and an OpenAPI spec for the contract.