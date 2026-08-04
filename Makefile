.PHONY: build test check smoke

build:
	npm run build

test:
	npm test

check:
	npm run check

smoke: build
	@output="$$(node server/index.js)" && test -z "$$output"
