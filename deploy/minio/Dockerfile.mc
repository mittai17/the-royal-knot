# MinIO's `mc` client is no longer published as an image either; build it from source.
FROM golang:1.24-alpine AS build
RUN apk add --no-cache git
ARG MC_REF=RELEASE.2025-04-16T18-13-26Z
RUN CGO_ENABLED=0 go install -ldflags "-s -w" github.com/minio/mc@${MC_REF}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/mc /usr/bin/mc
ENTRYPOINT ["/bin/sh"]
