# PROMPTS.md

Prompts used to build this project, as requested in the assessment instructions.

## How I work with AI

- **Plan before building.** The project started with a planning step: the stack, monorepo
  structure, API contract and build order were agreed before any code was generated, and
  the creation steps were reviewed in Claude Code's plan mode. Each part was reviewed
  before the next one started (#01).
- **Context first.** [CLAUDE.md](CLAUDE.md) gives Claude Code the commands, architecture
  boundaries and rules of this repo, so every request starts from the same constraints.
- **Scoped prompts with an approval gate.** Each change states what may be touched, the
  criteria, and the limits ("do not change code", "do not commit"); for larger edits Claude
  Code lists its plan and waits for my approval.
- **Independent review before submitting.** A software-architect agent and a product-manager
  agent reviewed the finished project in parallel; I triaged their findings and shipped the
  fixes through a pull request with CI (#09, #10).
- **Verify before accepting.** Every prompt ends with formatting, vet, lint, typecheck and
  tests, and I review the diff. I rejected parts of plans (#06) and found a new issue while
  reviewing a result (#07 → #08).

| | |
|---|---|
| **Tools** | Claude (chat) for planning and the first implementation; Claude Code (VS Code), including plan mode, for planning steps and scoped changes in the repository |
| **Project context** | [CLAUDE.md](CLAUDE.md), loaded by Claude Code on every request: commands, architecture rules and conventions |

## Index

| # | Prompt | Tool | Type |
|---|---|---|---|
| 01 | [Plan the architecture, then generate the first version](#01--plan-the-architecture-then-generate-the-first-version) | Chat | Planning, generation |
| 02 | [Phone-calculator behavior → backend precedence](#02--phone-calculator-behavior--backend-precedence) | Chat | Design decision |
| 03 | [Project context for Claude Code](#03--project-context-for-claude-code) | Chat | Context engineering |
| 04 | [Docker and CI](#04--docker-and-ci) | Chat | Build, CI |
| 05 | [Client-friendly decode error messages](#05--client-friendly-decode-error-messages) | Claude Code | Fix |
| 06 | [Trim explanatory comments](#06--trim-explanatory-comments) | Claude Code | Refactor |
| 07 | [Test the decode error helpers](#07--test-the-decode-error-helpers) | Claude Code | Tests |
| 08 | [Log unexpected errors, return a generic 500](#08--log-unexpected-errors-return-a-generic-500) | Claude Code | Fix |
| 09 | [Parallel architecture and product review](#09--parallel-architecture-and-product-review) | Claude Code agents | Review |
| 10 | [Fix the review findings](#10--fix-the-review-findings) | Claude Code | Fix |

Each entry has the prompt, the outcome, and **Review**: what I accepted, changed or rejected.

---

## 01 · Plan the architecture, then generate the first version

Planning prompt, before any code:

```text
Context: take-home assessment for a Mobile Engineer role at a fintech. The job
description lists React Native and TypeScript, REST APIs, automated tests (unit,
integration, E2E), release processes and proven experience with Claude. The
company's stack is Go, TypeScript, React and React Native, AWS, Kubernetes and
GitLab CI/CD.

The assessment: a calculator with a React frontend (TypeScript preferred) and a
backend microservice (Go preferred); basic and optional operations; input
validation and edge cases; JSON responses; responsive UI; unit tests and coverage
on both layers; README; optional Dockerfile; 2 to 4 hours; prioritize
correctness, clarity and maintainability over extra features.

Before writing any code, plan the work:
1. What will the reviewers most likely evaluate, given the job description?
2. Stack and repository structure, with the reason for each choice.
3. The API contract.
4. The order of the creation steps, with what to verify at the end of each one.
5. Options for how we work: you build everything, we build part by part with my
   review, or you only guide me.
```

**Plan agreed:** a monorepo; Go with the standard library only; React + TypeScript with
Vite (Next.js rejected, since the task asks for a frontend that consumes a separate
microservice); `POST /api/v1/calculate` plus `GET /health`; table-driven tests in Go,
Vitest with Testing Library and MSW in the frontend; build order backend → frontend →
Docker and CI → README and PROMPTS.md. I reviewed the creation steps in Claude Code's plan
mode and chose to build part by part, reviewing each part before the next.

Generation prompt, following the plan:

```text
Start with the backend. I have never used Go: begin with a summary of what I need
for this case. Then:
- Backend: POST /api/v1/calculate with { operation, a, b }, returning { result }
  or { error }; GET /health. Pure logic separated from HTTP.
- Frontend: React + TypeScript + Vite, with the logic in a folder that has no DOM
  dependency, so it could be reused in React Native.
- Tests on both layers, in a single repository.
```

**Outcome:**
- Backend: `calculator` (pure arithmetic, sentinel errors such as `ErrDivisionByZero`) and
  `api` (decoding, validation, error mapping: 400 for malformed requests, 422 for impossible
  math). `b` is a pointer, so a missing operand is told apart from `0`. Results that are
  `NaN` or `±Inf` are rejected, since JSON cannot represent them. Table-driven tests.
- Frontend: a typed API client returning `Result<T>` with runtime checks of the response,
  request cancellation with `AbortController`, and network-level integration tests with MSW.
  The first UI draft (two number fields and an operation selector) was replaced by the
  keypad before the first commit.

**Review:** I ran each part locally and reviewed it before moving on to the next.

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

**Outcome:**
- Backend image: multi-stage build, static binary (`CGO_ENABLED=0`), distroless runtime
  running as non-root, graceful shutdown on `SIGTERM`.
- Frontend image: Node build stage, nginx serving the static files and proxying `/api` to
  the Go service; hashed assets cached, `index.html` never cached.
- `ALLOWED_ORIGIN=""` in compose disables CORS, which required reading the variable with
  `os.LookupEnv` so an empty value is distinct from an unset one.
- CI: three jobs (backend, frontend, Docker). The Docker job starts the stack and checks
  that `5 + 3 × 2` returns `11` through nginx. Coverage appears in each run's summary and as
  artifacts.

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
on my installed Node 24 without changing my global version. I then asked Claude Code to add
`"engines": { "node": ">=22.19" }` to `frontend/package.json`, and added `.nvmrc` myself.

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

## 09 · Parallel architecture and product review

Both agents ran at the same time, with no permission to edit files.

```text
@software-architect Review this repository before I submit it as a take-home
assessment for a Mobile Engineer role (React Native, TypeScript; the company's
backend is Go). Read CLAUDE.md first.

Focus on:
- layer boundaries (calculator vs api in Go; core vs components in the frontend)
- logic bugs and edge cases in Evaluate, the keypad reducer and useCalculator
- type safety gaps and unvalidated input
- security issues in the HTTP layer
- anything that would be hard to reuse in a React Native client

Do not suggest new features, style changes or hypothetical requirements.
Report findings ranked by severity, each with file:line, the problem and the
minimal fix. Do not edit any file.
```

```text
@product-manager This is a take-home calculator for a fintech hiring process. The
brief asks for basic and optional operations, input validation, error handling and
basic mobile support, and says to prioritize correctness, clarity and
maintainability over extra features.

Using the running app and the README, evaluate it as a user and as the reviewer
of the assessment:
- friction or confusing behavior in the keypad (%, √, ±, errors, results)
- anything in the brief that is missing or weak
- what to fix before submitting vs what to leave for "With more time"

Do not propose new features unless they fix a real problem. Give a short,
prioritized list. Do not edit any file.
```

**Outcome:**
- Architect: 6 findings, each reproduced against the real reducer, client or backend. The
  most important: `instanceof DOMException` throws on React Native (Hermes has no global
  `DOMException`), the empty `catch` swallows it, and the keypad stays stuck in loading. This
  contradicted the README's claim that `core/` is reusable in React Native.
- Product manager: the project is close to ready; it confirmed two of the architect's
  findings from the user's side and added two more (raw server text shown for 400 errors,
  and a full-screen breakpoint that left out the largest iPhones).

**Review:** I fixed 7 items before submitting and left 6 low-impact items for "With more
time". One finding (`.nvmrc` 24 vs `>=22.19`) was not a real conflict, so I kept it.

---

## 10 · Fix the review findings

Claude Code proposed a plan for each fix. My approval, with adjustments:

```text
Go ahead, with these adjustments. Send me the plan for each fix before editing,
one fix per commit, each with a regression test.

1. DOMException on React Native: check signal.aborted instead of instanceof
   DOMException, and in run() dispatch failed unless controller.signal.aborted.
   In the same fix, return early in run() if the signal was aborted after the
   await (C pressed while the body is read).
2. history: null in entryReplaced.
3. Rewrite RESULT_NOT_FINITE to cover non-real and too-large results.
4. Backspace over an operator: reopen the previous operand for editing only if
   it looks like something a user could type (no exponent, at most 15 digits);
   otherwise reopen it with entryIsResult: true.
5. Also fix null operands in the backend: Operands []*float64 and 400
   INVALID_INPUT for nil elements. Follow the CLAUDE.md rule for contract changes
   (Go tests, types.ts if needed, MSW fake server, README).
6. A user-facing message for INVALID_JSON, INVALID_INPUT and UNKNOWN_OPERATION.
7. Raise the full-screen breakpoint from 420px to 480px.

Leave the README time placeholder to me. Run all checks after each fix.
```

```text
Plan approved as written, including the re-throw in json().

- Branch: use fix/review-findings, one commit per fix. When all seven are done,
  push the branch and tell me, so I can open a pull request and let CI run
  before merging.
- Fix 7: no automated test. Say in the commit message that jsdom does not
  evaluate media queries, and that I will check it manually in device mode.
```

**Outcome:**
- Seven `fix:` commits on `fix/review-findings`, merged through a pull request after CI.
- Aborts are detected with `signal.aborted`, so the client no longer depends on
  `DOMException`; `run()` can no longer stay stuck in loading.
- `/evaluate` rejects `null` operands with 400 `INVALID_INPUT` (Go, MSW fake server and
  README updated together, per CLAUDE.md).
- User messages now come from a complete `Record<ErrorCode, string>`, so the compiler forces
  a message for every new error code and server text never reaches the user.
- Frontend tests went from 85 to 99; the Go packages stayed at 100% coverage.

**Review:**
- Two changes to the agent's proposals: the backspace rule keeps typed numbers editable
  instead of locking every reopened operand, and the backend `null` fix was included even
  though it touches the API contract, because the brief asks to validate input.
- Every new test was run against the previous version of the file and failed there, except
  one that guards behavior that must not change.
- Two problems were caught along the way: a check script that reported PASS when a Go test
  binary was blocked by Windows, and a commit message that claimed a manual check not yet
  done. Both were corrected before the push.
- The 480px breakpoint has no automated test (jsdom does not evaluate media queries); I
  checked it in the browser's device mode.