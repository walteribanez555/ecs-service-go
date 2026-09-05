# Dockerfile for ECS Go Monorepo

# 1. Builder stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY apps/api/go.mod apps/api/go.sum ./apps/api/
RUN cd apps/api && go mod download

COPY apps/api/ ./apps/api/

RUN cd apps/api && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /bin/server ./cmd/server/main.go

# 2. Production stage for the 'api' service
FROM alpine:3.21 AS api

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /bin/server .

EXPOSE 8080

CMD ["./server"]
