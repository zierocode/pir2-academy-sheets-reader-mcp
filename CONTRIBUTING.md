# Contributing

## Local setup

```sh
npm ci
```

## Required checks

```sh
npm test
npm run build
npm run check
make smoke
```

## Change rules

- Keep the runtime compatible with Node.js 20 or later and TypeScript ESM.
- Preserve stdout for MCP JSON-RPC messages; diagnostics belong on stderr.
- Keep the public repository free of secrets, learner data, and course-only assets.
- Add a focused test before production behavior changes, then run the relevant checks.
