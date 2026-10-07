# pi-saia-plugin — common tasks.  Use: make <target>
#
# The help text lives in a `define` block on purpose: a multi-line plain
# assignment (the previous approach) is a *parse error* in every line after the
# first, which made the whole Makefile fail with "missing separator" — every
# target, including `make install`. test/test.sh now asserts this file parses
# and that every target named in the help text exists.

.DEFAULT_GOAL := help

GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

DOCKER_IMAGE   ?= ghcr.io/tobias-weiss-ai-xr/pi-saia-plugin
DOCKER_TAG     ?= latest
DOCKER_TAG_DEV ?= latest-dev
PI_APP_DIR     := /home/pluginuser/app

define HELP_TEXT
$(YELLOW)pi-saia-plugin — Makefile$(NC)

Usage: make <target>

Core:
  help            Show this help message
  install         Register this checkout with pi
  uninstall       Remove it from pi
  build           TypeScript type check (tsc --noEmit)
  lint            Alias for build
  test            Unit + hermetic wire tests (npm test)
  test-smoke      Structure / package / skill / workflow smoke suite
  verify          tsc + tests + smoke — what CI runs
  sync-check      Verify the model catalog against the live SAIA API
  sync-models     Regenerate the model catalog from the live SAIA API
  clean           Remove build artifacts

Docker:
  docker          Build the production and development images
  docker-dev      Build the development image
  docker-push     Push both images to GHCR
  docker-pull     Pull both images from GHCR
  docker-run      Shell in the sandbox image with this checkout mounted
  dockertest      Run the smoke suite inside the image (read-only mount)
  docker-validate Lint the Dockerfile (buildx --call=check)
  docker-clean    Prune docker artifacts

Sandbox:
  sandbox         Start the interactive sandbox
  sandbox-dev     Start the development sandbox
  sandbox-test    Run the sandbox tests
  sandbox-showcase  Showcase mode
  video             Record docs/media/install.webm (needs ffmpeg + SAIA_API_KEY)

Version:
  version         Print the current version
  bump-major      Bump the major version
  bump-minor      Bump the minor version
  bump-patch      Bump the patch version

Examples:
  make verify
  SAIA_API_KEY=... make sandbox
endef
export HELP_TEXT

.PHONY: all help install uninstall build lint test test-smoke verify sync-check sync-models clean
.PHONY: docker docker-dev docker-push docker-pull docker-run dockertest docker-validate docker-clean
.PHONY: sandbox sandbox-dev sandbox-test sandbox-showcase
.PHONY: version bump-major bump-minor bump-patch

all: help

# =============================================================================
# Core
# =============================================================================

help:
	@printf '%b\n' "$$HELP_TEXT"

install:
	@echo "$(GREEN)✓ Installing pi-saia-plugin...$(NC)"
	pi install $(CURDIR)
	@echo "  Verify:  pi --list-models | grep '^saia'"
	@echo "  Set key: export SAIA_API_KEY=...   (or run: pi auth)"

uninstall:
	@echo "$(GREEN)✓ Removing pi-saia-plugin...$(NC)"
	pi remove $(CURDIR)

build:
	@echo "$(GREEN)✓ Checking TypeScript types...$(NC)"
	npx tsc --noEmit

lint: build

test:
	@echo "$(GREEN)✓ Running unit + hermetic wire tests...$(NC)"
	npm test

test-smoke:
	@echo "$(GREEN)✓ Running smoke suite...$(NC)"
	bash test/test.sh

verify:
	@echo "$(GREEN)✓ Running full verification (tsc + tests + smoke)...$(NC)"
	npm run verify

sync-check:
	@echo "$(GREEN)✓ Checking the catalog against the live SAIA API...$(NC)"
	./scripts/sync-saia-models.sh --check

sync-models:
	@echo "$(GREEN)✓ Regenerating the model catalog...$(NC)"
	./scripts/sync-saia-models.sh

clean:
	@echo "$(GREEN)✓ Cleaning build artifacts...$(NC)"
	rm -rf dist coverage .nyc_output node_modules/.cache
	rm -f ./*.tsbuildinfo

# =============================================================================
# Docker
# =============================================================================

docker:
	@echo "$(GREEN)✓ Building production Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .
	@echo "$(GREEN)✓ Building development Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG_DEV) --target builder .

docker-dev:
	@echo "$(GREEN)✓ Building development Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG_DEV) --target builder .

docker-push:
	@echo "$(GREEN)✓ Pushing production Docker image...$(NC)"
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo "$(GREEN)✓ Pushing development Docker image...$(NC)"
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG_DEV)

docker-pull:
	@echo "$(GREEN)✓ Pulling production Docker image...$(NC)"
	docker pull $(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo "$(GREEN)✓ Pulling development Docker image...$(NC)"
	docker pull $(DOCKER_IMAGE):$(DOCKER_TAG_DEV)

docker-run:
	@echo "$(GREEN)✓ Running sandbox container...$(NC)"
	docker run -it --rm \
		-e SAIA_API_KEY="$(SAIA_API_KEY)" \
		-v "$(CURDIR):$(PI_APP_DIR)" \
		-w "$(PI_APP_DIR)" \
		$(DOCKER_IMAGE):$(DOCKER_TAG) bash

dockertest:
	@echo "$(GREEN)✓ Running the smoke suite in the container...$(NC)"
	# The dev image is used on purpose: it carries python3 + PyYAML, so the
	# workflow/trigger checks actually run instead of skipping. The mount is
	# read-only to prove the suite never writes to the checkout.
	docker run --rm \
		-e SAIA_API_KEY="mock-test-key" \
		-v "$(CURDIR):$(PI_APP_DIR):ro" \
		-w "$(PI_APP_DIR)" \
		$(DOCKER_IMAGE):$(DOCKER_TAG_DEV) \
		bash test/test.sh

docker-validate:
	@echo "$(GREEN)✓ Linting the Dockerfile...$(NC)"
	docker buildx build --call=check .

docker-clean:
	@echo "$(GREEN)✓ Cleaning docker artifacts...$(NC)"
	docker image prune -f
	docker builder prune -f

# =============================================================================
# Sandbox
# =============================================================================

sandbox:
	@echo "$(GREEN)✓ Starting interactive sandbox...$(NC)"
	./sandbox/run.sh

sandbox-dev:
	@echo "$(GREEN)✓ Starting development sandbox...$(NC)"
	./sandbox/dev.sh

sandbox-test:
	@echo "$(GREEN)✓ Running sandbox tests...$(NC)"
	./sandbox/test.sh

video:
	@echo "$(CYAN)Recording the install walkthrough...$(NC)"
	@command -v python3 >/dev/null 2>&1 || { echo "$(RED)python3 + Pillow are required$(NC)"; exit 1; }
	@test -n "$(SAIA_API_KEY)" || { echo "$(RED)SAIA_API_KEY is required$(NC)"; exit 1; }
	python3 scripts/make-install-video.py

sandbox-showcase:
	@echo "$(GREEN)✓ Running showcase mode...$(NC)"
	./sandbox/showcase.sh

# =============================================================================
# Version
# =============================================================================

version:
	@node -p "require('./package.json').version"

bump-major:
	npm version major -m "chore: bump major version"

bump-minor:
	npm version minor -m "chore: bump minor version"

bump-patch:
	npm version patch -m "chore: bump patch version"
