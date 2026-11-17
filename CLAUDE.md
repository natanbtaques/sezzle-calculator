# CLAUDE.md

Full-stack calculator built for the Sezzle technical assessment.
Monorepo: `backend/` (Go REST API) and `frontend/` (React + TypeScript + Vite).
The two only talk over HTTP; neither imports code from the other.

## Commands

Backend (run inside `backend/`):
- `go run ./cmd/server` — API on :8080 (env: `PORT`, `ALLOWED_ORIGIN`)
- `go test ./... -cover` — tests with coverage
- `go vet ./... && gofmt -l .` — must print nothing

Frontend (run inside `frontend/`):
- `npm run dev` — app on :5173, proxies `/api` to :8080 (start the backend first)
- `npm test` / `npm run coverage` — Vitest
- `npm run typecheck` and `npm run lint` — must pass with no errors
- `npm run build`

Before finishing any change, run the tests, typecheck and lint of every part you touched.

## Architecture

### Backend
- `internal/calculator/` — pure arithmetic, no HTTP or JSON. `Calculate` (one operation)
  and `Evaluate` (expression with precedence: power > ×/÷ > +/−, power right-associative).
- `internal/api/` — HTTP only: decode, validate, call `calculator`, encode JSON.
- `cmd/server/` — wiring, config from env, graceful shutdown.
- Standard library only. Do not add dependencies.
- Domain errors are sentinel values (`ErrDivisionByZero`, …) mapped to HTTP in `mapError`:
  400 = malformed request, 422 = valid request but mathematically impossible.
- Every error response is `{"error": {"code": "...", "message": "..."}}` with a stable `code`.

### Endpoints
- `POST /api/v1/evaluate` — `{"operands":[33,12,4],"operators":["multiply","add"]}` → `{"result":400}`
- `POST /api/v1/calculate` — `{"operation":"sqrt","a":9}` → `{"operation":"sqrt","result":3}`
- `GET /health`

### Frontend
- `src/core/` — platform-agnostic logic, reusable in React Native. **Never import from
  the DOM, CSS or `components/` here.**
  - `types.ts` — API contract; must mirror the Go structs and error codes.
  - `expression.ts` — pure keypad reducer `(state, action) => state` plus selectors.
  - `api.ts` — fetch client returning `Result<T>`; only aborts are thrown.
  - `useCalculator.ts` — connects the reducer to the API.
- `src/components/` — web UI only (rendering, CSS, physical keyboard).
- The frontend never does arithmetic: every result comes from the API.
- User-facing error text is chosen by error `code` (`messages.ts`), never by parsing `message`.

## Conventions

- Go: table-driven tests with `t.Run`; compare errors with `errors.Is`.
- TypeScript: `strict`, no `any`; validate network data with runtime type guards.
- Tests: query by role and accessible name (Testing Library), not by CSS class.
  Mock the network with MSW (`src/test/server.ts`), not by mocking modules.
- Styling: plain CSS with variables in `index.css`; no CSS framework.
- Accessibility: every button has an accessible name; results and errors are announced
  via `aria-live`.
- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`), small and focused.

## Rules

- Changing the API contract means updating, in the same change: the Go structs,
  `frontend/src/core/types.ts`, the MSW fake server, the tests on both sides and the README.
- Do not add dependencies (Go or npm) without asking first.
- Keep the scope small: correctness, clarity and tests over extra features.
- Error messages must not leak internals (Go type names, stack traces).