# ADR-009: Pluggable private object storage

## Context

Local disk is convenient for development and single-container deployments, but it does not provide durable shared media storage across replaceable API instances. Media must remain private, be streamed through the API, and preserve HTTP byte-range behavior for video and other large files. Backblaze B2 offers an S3-compatible API and is a supported deployment target.

## Decision

Keep local disk as the default `Storage` implementation and add an S3-compatible implementation selected with `STORAGE_DRIVER=s3`. S3 mode requires an endpoint, region, bucket, access key ID, and secret access key; path-style addressing is configurable and defaults on for MinIO and compatible providers. Startup validates this configuration before opening PostgreSQL, and `/readyz` verifies the selected backend.

Objects use opaque random names. Buckets remain private: the API does not set public ACLs or return object-store URLs. Uploads are content-sniffed and size-bounded before storage; reads are proxied by the API and support range requests through range-based S3 reads. Deletion removes the stored object. The original file extension remains in the random key for response content-type selection.

For Backblaze B2, set `S3_ENDPOINT` to `https://s3.<region>.backblazeb2.com`, `S3_REGION` to the corresponding region, `S3_BUCKET` to a private bucket, `S3_ACCESS_KEY_ID` to the B2 application key ID, and `S3_SECRET_ACCESS_KEY` to the application key. Grant only the bucket-level permissions needed to list/head, read, write, and delete objects. Never use a master application key where a bucket-restricted key is sufficient.

## Consequences

- Local development and existing installations retain local disk unless explicitly switched to S3.
- S3 deployments require credentials and a pre-created private bucket; readiness remains unhealthy until the bucket is reachable.
- Runtime API bandwidth is used for all downloads, but bucket privacy and existing API authorization/public-media semantics are preserved.
- Local writes use the upload volume; S3 writes spool to a bounded temporary file before upload to avoid unbounded memory usage.
- The Compose `s3` profile builds the pinned MinIO source revision in `infra/minio/version`; CI runs that same pinned revision as a temporary local service and reuses the Go dependency cache.
