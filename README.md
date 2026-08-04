Built for PiR2 Academy — Advanced Claude Cowork

# PiR2 Academy Sheets Reader MCP

This repository contains the public, read-only local MCP bootstrap for PiR2 Academy Sheets Reader.

## Status

The executable contract is established in this initial bootstrap. Tool, connection, and bundle implementation are intentionally outside this revision.

## Requirements

- Node.js 20 or later
- npm

## Development

```sh
npm ci
npm run build
npm test
npm run check
make smoke
```

`make smoke` compiles the entry point and confirms direct startup emits no stdout output. Stdout is reserved for MCP JSON-RPC traffic.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
