# nextscan

MCP server that scans Next.js projects and returns a compact summary. One tool call → full project overview.

## What it does

| Without nextscan | With nextscan |
|---|---|
| Manual file-by-file exploration | Single `scan` call |
| Multiple tool calls to understand routes | Compact route tree with flags |
| Missing security issues | Hardcoded secrets + env leak detection |
| Unknown API coverage | Auth + validation status per endpoint |
| Schema guesswork | Prisma/Drizzle relation mapping |

## Quick Install

```bash
# Clone and build
cd nextscan
npm install
npm run build

# Add to Claude Code
claude mcp add nextscan -- node /path/to/nextscan/dist/index.js
```

## Tool: `scan`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | Yes | Absolute path to Next.js project root |
| `focus` | enum | No | `routes` \| `api` \| `schema` \| `security` |

## Example Output

```
nextscan — my-app
────────────────────────────────────────
Root: /Users/dev/my-app
   src/ : yes  app/ : yes  middleware: yes
   ORM  : prisma

Routes
   Pages: 12  Layouts: 3  API: 5
   Dynamic: 4  Static: 8
   Client: 3  Server: 9
   Groups: (marketing), (auth)
   Matchers: /dashboard/:path*, /api/:path*
   ┌─ Pages
   ├─ /
   ├─ /about
   ├─ /dashboard [client]
   ├─ /blog/[slug] [dyn,SSG]
   └─ /settings [client]

API Endpoints
   Total: 5  Unprotected: 1
   ├─ GET,POST /api/users [auth:next-auth | val:zod]
   ├─ GET /api/health [no-auth,no-rate-limit]
   └─ POST /api/webhook [no-auth,no-validation]

Schema
   Models: 5  Relations: 4
   Orphans: AuditLog
   User ─< Post (1:N)
   User ─ Profile (1:1)
   Post >─< Tag (N:N)

Security
   Score: 75/100  Headers: yes  Middleware: yes
   [high] API route /api/health has no auth: [GET]
   [medium] No rate limiting on /api/users
```

## Example Prompts

- "Scan my Next.js project at /Users/dev/my-app"
- "Check the security of my Next.js app"
- "Show me the route structure"
- "Analyze the database schema"

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── tools/scan.ts         # Orchestrator
├── analyzers/
│   ├── routes.ts         # App router analysis
│   ├── api.ts            # API endpoint analysis
│   ├── schema.ts         # Schema orchestration
│   └── security.ts       # Security scanning
├── parsers/
│   ├── typescript.ts     # ts-morph utilities
│   ├── prisma.ts         # Regex-based Prisma parser
│   └── drizzle.ts        # AST-based Drizzle parser
├── formatters/
│   └── compact.ts        # Unicode tree formatter
└── utils/
    ├── fs.ts             # File system utilities
    └── detect.ts         # Project detection
```

## Requirements

- Node.js 18+
- An MCP-compatible client (Claude Code, Claude Desktop, etc.)

## Development

```bash
npm install
npm run build
npm test
npm run test:coverage
```

## Author

**Berkay Derin** — [github.com/berkayderin](https://github.com/berkayderin)

## License

MIT
