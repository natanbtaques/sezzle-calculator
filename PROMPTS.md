# PROMPTS.md

Prompts used to build this project, as requested in the assessment instructions.

| | |
|---|---|
| **Tools** | Claude (chat) for planning and the first implementation; Claude Code (VS Code) for scoped changes in the repository |
| **Project context** | [CLAUDE.md](CLAUDE.md), loaded by Claude Code on every request: commands, architecture rules and conventions |

## Index

| # | Prompt | Tool | Type |
|---|---|---|---|
| 01 | [Plan and generate the first version](#01--plan-and-generate-the-first-version) | Chat | Planning, generation |
| 02 | [Phone-calculator behavior → backend precedence](#02--phone-calculator-behavior--backend-precedence) | Chat | Design decision |
| 03 | [Project context for Claude Code](#03--project-context-for-claude-code) | Chat | Context engineering |
| 04 | [Docker and CI](#04--docker-and-ci) | Chat | Build, CI |
| 05 | [Client-friendly decode error messages](#05--client-friendly-decode-error-messages) | Claude Code | Fix |
| 06 | [Trim explanatory comments](#06--trim-explanatory-comments) | Claude Code | Refactor |
| 07 | [Test the decode error helpers](#07--test-the-decode-error-helpers) | Claude Code | Tests |
| 08 | [Log unexpected errors, return a generic 500](#08--log-unexpected-errors-return-a-generic-500) | Claude Code | Fix |
| 09 | [Require Node 22.19+](#09--require-node-2219) | Claude Code | Chore |

Each entry has the prompt, the outcome, and **Review**: what I accepted, changed or rejected.

---

## 01 · Plan and generate the first version

```text
Here is the take-home e-mail and the job description (Mobile Engineer, React Native).
What will they evaluate, and what should the stack and structure be?

Then build it one part at a time, so I can review each part before moving on:
- Backend in Go, standard library only (I have never used Go: start with a summary
  of what I need for this case). POST /api/v1/calculate with { operation, a, b },
  returning { result } or { error }; GET /health. Pure logic separated from HTTP.
- Frontend in React + TypeScript + Vite, with the logic in a folder that has no DOM
  dependency, so it could be reused in React Native.
- Tests on both layers, in a single repository.
```

**Outcome:** A monorepo; `calculator` and `api` packages with table-driven tests; a first
frontend draft with two number fields and an operation selector, tested with Vitest, Testing
Library and MSW, and replaced by the keypad before the first commit.

**Review:** I asked whether to use Next.js and decided against it: the task asks for a
frontend that consumes a separate microservice, and Next.js adds a second server with no
benefit here. I ran both parts locally before continuing.

---

## 02 · Phone-calculator behavior → backend precedence

The requirement, in product terms:

```text
Instead of two number fields and a fixed operation, show the expression as I type:
33, then ×, then 12, and pressing + keeps accumulating (33 × 12 + …), like a modern
phone calculator.
```

This raised a design question: who evaluates a chained expression? The client, step by step
(`5 + 3 × 2 = 16`), or the backend, with operator precedence (`= 11`).

```text
The backend evaluates the whole expression with precedence.
```

**Outcome:**
- `POST /api/v1/evaluate` receives the expression **already tokenised**
  (`{"operands":[5,3,2],"operators":["add","multiply"]}`), so the backend never parses
  text and syntax errors cannot exist.
- Go evaluates it with the shunting-yard algorithm (two stacks, power right-associative),
  reusing `Calculate` so division by zero and overflow are handled in one place.
- The frontend models the keypad as a pure reducer and never does arithmetic.

**Review:** I chose backend precedence to keep a single source of truth for the math.
Testing the result, I found that the full-screen phone layout was triggered by window width
alone, so a narrow desktop window looked like a phone; it now also requires a touch screen
(`pointer: coarse`).

---

## 03 · Project context for Claude Code

```text
Create a CLAUDE.md for this repository so Claude Code follows the project's rules:
the commands to run, test and lint each part; the architecture boundaries; the
conventions; and the constraints. Keep it short: no explanations that belong in
the README, nothing Claude already does by default.
```

**Outcome:** [CLAUDE.md](CLAUDE.md) with commands, architecture rules (`core/` never imports
from the DOM, the frontend never does arithmetic, the API contract is mirrored in
`types.ts`), conventions (table-driven tests, queries by role, Conventional Commits) and
rules (no new dependencies without asking, error messages never leak internals).

**Review:** I kept it in sync as the project grew (Node requirement, Docker, CI). Its rule on
leaking internals is what #05 and #08 enforce.

---

## 04 · Docker and CI

```text
Add Docker and CI:
- Dockerfiles for both parts and a docker compose file that runs the whole app with
  one command. The browser must talk to a single origin, so no CORS in Docker.
- A GitHub Actions workflow that runs formatting, vet, lint, typecheck and all tests
  with coverage on every push, and a smoke test of the full stack in Docker.
```

**Outcome:** Multi-stage Dockerfiles (distroless image for Go, nginx for the frontend), nginx
proxying `/api` to the Go service, `docker-compose.yml`, and a CI workflow whose Docker job
checks that `5 + 3 × 2` returns `11` through nginx. Coverage appears in each run's summary
and as artifacts.

**Review:** I ran the stack locally and confirmed the requests flow browser → nginx → Go.
`npm audit` reported advisories; `npm audit --omit=dev` showed none in production
dependencies, so I did not force upgrades.

---

## 05 · Client-friendly decode error messages

```text
Decode errors from encoding/json are returned to the client as is, and they expose
Go type names (e.g. "Go struct field CalculateRequest.a of type float64"). Rewrite
them in terms of the JSON payload the client sent (e.g. field "a" must be a number),
covering type mismatches, malformed JSON, unknown fields, empty and oversized bodies.
Add a test that fails if any error message contains Go internals. Run gofmt, vet and
the tests.
```

**Context:** `{"a":"x"}` returned
`json: cannot unmarshal string into Go struct field CalculateRequest.a of type float64`.

**Outcome:** `describeDecodeError` rewrites decoder errors in terms of the JSON payload
(`field "a" must be a number`). A test fails if any message contains Go internals.

---

## 06 · Trim explanatory comments

```text
Review the comments in the non-test source files of this repo and keep only the
ones that add value for a code reviewer. Do not change any code, only comments.

Scope:
- backend/**/*.go (excluding *_test.go)
- frontend/src/**/*.{ts,tsx,css} (excluding *.test.* and src/test/)
- frontend/vite.config.ts

KEEP:
- Go doc comments on exported identifiers and package comments (idiomatic Go,
  used by go doc). You may shorten them, but keep them starting with the name.
- Comments that explain WHY a non-obvious decision was made (e.g. pointer to tell
  "missing" from zero, NaN/Inf not representable in JSON, 400 vs 422, power being
  right-associative, preventDefault on Enter, field docs in ExpressionState).

REMOVE or SHORTEN:
- Tutorial-style comments that explain a technology rather than this project
  (what MSW is, what aria-live does, that TypeScript types vanish at runtime,
  which signals Docker sends).
- Comments that restate WHAT the code or the identifier name already says.
- Multi-line file headers that repeat what CLAUDE.md or the README already cover;
  reduce them to one line or remove them.

Process:
1. First, list every comment you plan to remove or shorten, grouped by file, with
   a one-line reason each. Wait for my approval before editing.
2. After I approve, apply the changes.
3. Run gofmt -l, go vet and go test in backend/, and typecheck, lint and tests in
   frontend/. All must pass.
4. Show me the final diff. Do not commit.
```

Follow-up, after reviewing the plan:

```text
Approved, with two changes:
1. Keep both JSDoc comments on calculate and evaluate in api.ts. "calculate" and
   "evaluate" are near-synonyms, so the comments are what tells the reader which
   one handles a single operation and which one handles a full expression.
2. Keep the comment above the unmount cleanup in useCalculator.ts. The
   double-arrow form `useEffect(() => () => ..., [])` is easy to misread, so a
   one-line comment helps reviewers.
Everything else as proposed. Apply, run the checks and show me the diff.
```

**Outcome:** Comment-only changes in 9 files; all checks pass.

**Review:** Three proposed removals rejected, in two change requests (above). While running
the checks, Claude Code found that the test environment (jsdom, through undici) needs
Node ≥ 22.19 and that Windows Application Control blocks Go test
binaries in `%TEMP%`; it reported both instead of changing code, and ran the frontend checks
on my installed Node 24 without changing my global version.

---

## 07 · Test the decode error helpers

```text
Add table-driven tests in backend/internal/api for describeDecodeError and
jsonTypeName, covering each branch (type mismatch per JSON type, syntax error,
unknown field, empty body, oversized body). Then run go test -cover and show
the coverage for the api package.
```

**Outcome:** `decode_test.go` with 39 subtests; api package coverage 93.7% → 98.9%.

**Review:** The only remaining gap was the 500 branch of `mapError`. Reading it, I noticed
the handlers would send `err.Error()` to the client on a 500, the same kind of leak as in
#05, which led to #08.

---

## 08 · Log unexpected errors, return a generic 500

```text
In handleCalculate and handleEvaluate, when mapError returns 500, do not send
err.Error() to the client: log the error with the request logger context and
respond with a generic message ("internal server error"). Add a unit test that
calls mapError with an unknown error and asserts 500 and INTERNAL_ERROR, and a
test proving the 500 response message does not contain the original error text.
Run gofmt, vet and the tests.

The handler has no access to the logger today. If this requires a big change,
slog.Default() is fine. Keep it simple.
```

**Outcome:** A `handlers` struct holding the logger already passed to `NewRouter`, and a
`writeCalcError` helper: 500s are logged and answered with a generic message; 400 and 422
keep their message. `errors_test.go` added; api package at 100% coverage.

**Review:** Accepted Claude Code's alternative to `slog.Default()`: injecting the existing
logger avoids global state with the same amount of change.

---

## 09 · Require Node 22.19+

```text
Update my engines here: "engines": { "node": ">=22.19" }
```

**Outcome:** `engines` added to `frontend/package.json` with `npm pkg set`; tests re-run on
Node 24.

**Review:** I added `.nvmrc` and the requirement to `CLAUDE.md` and the README myself.