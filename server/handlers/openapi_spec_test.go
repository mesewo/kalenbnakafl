package handlers_test

import (
	"os"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestOpenAPISpecRoutesParity verifies that the OpenAPI spec and the Gin
// router are in sync: every registered route must have a spec operation, and
// every spec operation must have a registered route.
func TestOpenAPISpecRoutesParity(t *testing.T) {
	const specPath = "../../docs/openapi.yaml"
	data, err := os.ReadFile(specPath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("docs/openapi.yaml not found; skipping spec parity test")
		}
		t.Fatalf("read openapi spec: %v", err)
	}

	// Parse only the paths section — we don't need the full spec.
	var spec struct {
		Paths map[string]map[string]interface{} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(data, &spec); err != nil {
		t.Fatalf("parse openapi spec: %v", err)
	}

	// Build a set of (METHOD PATH) pairs from the spec.
	// OpenAPI uses {param}; Gin uses :param — we'll normalise to OpenAPI form for comparison.
	specOps := map[string]bool{}
	httpMethods := map[string]bool{
		"get": true, "post": true, "put": true, "patch": true,
		"delete": true, "head": true, "options": true, "trace": true,
	}
	for path, methods := range spec.Paths {
		for method := range methods {
			if !httpMethods[strings.ToLower(method)] {
				continue
			}
			key := strings.ToUpper(method) + " " + path
			specOps[key] = true
		}
	}

	// Build the Gin engine (skips if DATABASE_URL_TEST is unset).
	_, _, r := authTestApp(t)

	// Build a set of (METHOD PATH) pairs from the Gin router, normalising
	// Gin's :param notation to OpenAPI's {param} notation.
	ginRoutes := map[string]bool{}
	for _, route := range r.Routes() {
		path := ginParamToOpenAPI(route.Path)
		key := route.Method + " " + path
		ginRoutes[key] = true
	}

	// Check: every Gin route must appear in the spec.
	for key := range ginRoutes {
		if !specOps[key] {
			t.Errorf("registered route %q has no operation in docs/openapi.yaml", key)
		}
	}

	// Check: every spec operation must have a registered Gin route.
	for key := range specOps {
		if !ginRoutes[key] {
			t.Errorf("spec operation %q has no registered Gin route", key)
		}
	}
}

// ginParamToOpenAPI converts Gin-style path parameters (:id, :slug) to
// OpenAPI-style ({id}, {slug}).
func ginParamToOpenAPI(path string) string {
	segments := strings.Split(path, "/")
	for i, seg := range segments {
		if strings.HasPrefix(seg, ":") {
			segments[i] = "{" + seg[1:] + "}"
		}
	}
	return strings.Join(segments, "/")
}
