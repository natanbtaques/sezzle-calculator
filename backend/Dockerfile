# ---- Build stage: compile a static binary ----
FROM golang:1.24-alpine AS build
WORKDIR /src

# Copy go.mod first so dependency downloads are cached between builds.
COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---- Runtime stage: minimal image, no shell, runs as non-root ----
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
