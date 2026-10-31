# MinIO no longer publishes official images; build the server from its public source.
FROM golang:1.24-alpine AS build
RUN apk add --no-cache git
ARG MINIO_REF=RELEASE.2025-04-22T22-12-26Z
RUN CGO_ENABLED=0 go install -ldflags "-s -w" github.com/minio/minio@${MINIO_REF}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/minio /usr/bin/minio
EXPOSE 9000 9001
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD curl -fs http://localhost:9000/minio/health/live || exit 1
ENTRYPOINT ["/usr/bin/minio"]
