# Kalen Benakafil Completion TODO

## 1. Reliable application foundation
- [x] The website uses a yellow-led visual system with readable dark text, accessible contrast, responsive layouts, visible focus states, and mobile navigation.
- [x] Browser-facing API calls work in Preview and production without exposing Docker-internal hostnames to visitors.
- [x] The application has consistent loading, empty, validation, success, error, and access-denied states.
- [x] A complete `public/manus-routes.json` manifest describes all page routes.

## 2. Public NGO experience
- [x] The home page communicates Kalen Benakafil as a community NGO and provides clear actions for events, news, volunteering, and contact.
- [x] About, News, Events, Volunteer, and Contact pages are visually coherent, responsive, accessible, and free of faith-specific positioning.
- [x] Public News shows published posts only, and event dates are formatted for people rather than shown as raw database strings.
- [x] Volunteer registration and the public volunteer CTA lead to a functional, honest flow.

## 3. Content management
- [x] Admin/editor users can create posts and events with required-field validation and clear success/error feedback.
- [x] Admin/editor users can edit and delete posts/events with confirmation and refreshed lists.
- [x] Admin users can publish/unpublish posts, and unpublished content is not shown publicly.
- [x] Dashboard content pages are protected by both server authorization and client-side role guards.

## 4. Media library
- [x] Authorized users can upload validated media through a multipart form with status feedback.
- [x] Media metadata uses one consistent JSON field contract and links resolve correctly.
- [x] Authorized users can delete media with confirmation and the stored file metadata is removed safely.

## 5. Users and volunteers
- [x] Admin users can create, edit, delete, and role-manage users with allowlisted roles and safety checks.
- [x] Admin users can view volunteers through a dedicated backend flow rather than only filtering all users in the browser.
- [x] Admin users can assign/remove volunteer status and record volunteer hours or contributions.
- [x] User and volunteer screens are usable on narrow screens and expose clear empty/error states.

## 6. Profile and authentication
- [x] Profile data is database-backed and users can update allowed profile fields with validation.
- [x] Password changes require explicit confirmation and are not logged or exposed.
- [x] Auth context provides consistent login, registration, logout, and session-expiry behavior.
- [x] JWT parsing, configuration, CORS, request validation, and public endpoint abuse controls are production-safe defaults.

## 7. Data and release readiness
- [x] Schema changes are represented as versioned migrations, including role constraints, timestamps/indexes, media metadata, and volunteer contributions.
- [x] API/database configuration and JWT secrets are read from environment configuration rather than checked-in literals.
- [x] Database readiness, API health, and graceful startup behavior are documented and configured.
- [x] Frontend diagnostics, lint, type checks, and production build complete successfully.
- [x] Preview starts on the configured port and the managed project is checkpointed without publishing or changing the GitHub repository connection.
