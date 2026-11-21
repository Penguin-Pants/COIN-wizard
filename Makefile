# Shortcuts for the npm scripts. Publishing to the Claude artifact is a manual step (see README.md).
.PHONY: test test-ui build publish-check

test:
	npm test

test-ui:
	npm run test:ui

build:
	npm run build

# Both test suites and the build, then the page to publish and the commit it comes from.
publish-check: test test-ui build
	@echo "Page to publish: $(CURDIR)/dist/index.html"
	@echo "Commit: $$(git rev-parse --short HEAD)$$(test -z "$$(git status --porcelain)" || echo -dirty)"
