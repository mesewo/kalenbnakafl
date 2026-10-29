# ADR-011: Re-encoded responsive image media

## Context

Admin-uploaded images are public site assets, so filename or client MIME metadata cannot establish
their type. Original uploads may contain active/polyglot payloads, oversized dimensions, or private
EXIF/GPS metadata. The deployed frontend proxies `/api/*` but not `/uploads/*`; image URLs must use
the API route. The Go service must continue to build with `CGO_ENABLED=0`.

## Decision

Accept only JPEG, PNG, and WebP based on decoded content, with a 50 MiB absolute input ceiling,
10,000-pixel maximum side, and 40-megapixel maximum image area. Rotate according to EXIF orientation
for JPEG, PNG, and WebP, then decode and re-encode using pure-Go image libraries. Store 480, 960,
and 1600-pixel-wide variants in the configured private `Storage` backend; duplicate widths for
smaller sources reuse the same stored object. Re-encoding removes EXIF/GPS and trailing payloads.

Serve variants through `/api/media/{id}/file?w=480|960|1600`, keeping range requests and adding an
ETag plus `public, max-age=31536000, immutable` for public media. Only image IDs used by public
content can be read anonymously; staff preview remains private and uncached. Require localized alt
text in English and Amharic except when staff explicitly marks an image decorative.

## Consequences

- Upload type and image safety do not depend on filenames or declared content types.
- The pipeline remains available in CGO-disabled containers and stores all outputs through ADR-009's
  local/S3 abstraction.
- Re-encoding normalizes supported formats and discards original metadata; original bytes are not
  retained.
- Every image URL is same-origin under `/api`, works with the deployed proxy, and supports responsive
  selection without exposing object-store URLs.
- Images referenced by content are protected from deletion; staff must remove or replace references
  before deleting the media record.
