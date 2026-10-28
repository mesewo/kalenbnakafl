FROM golang:1.27.3-alpine AS builder

ENV CGO_ENABLED=0
COPY version /tmp/minio.version
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install -ldflags="-s -w" "github.com/minio/minio@$(cat /tmp/minio.version)"

FROM alpine:3.22.1

ENV HOME=/home/minio
RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 minio \
    && adduser -S -D -h /home/minio -u 10001 -G minio minio \
    && mkdir -p /data /home/minio/.minio \
    && chown -R minio:minio /data /home/minio
COPY --from=builder /go/bin/minio /usr/local/bin/minio

USER 10001:10001
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
