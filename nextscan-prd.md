# nextscan — PRD

> X-ray vision for your Next.js app. One MCP tool call, full project analysis.

## Overview

nextscan, Next.js projeleri için bir MCP (Model Context Protocol) sunucusudur. Claude Code ile entegre çalışır. Tek bir tool call ile tüm projeyi tarar ve kompakt bir özet döndürür. Büyük çıktılar context window'a girmez — sadece özetler girer.

## Problem

Next.js fullstack projelerinde Claude Code ile çalışırken:

- Proje yapısını anlatmak için dizin ağaçları, dosya içerikleri yapıştırılıyor → binlerce token harcanıyor
- API route'ların durumu (auth, validation) hakkında bilgi almak için tek tek dosya açılıyor
- Prisma/Drizzle şemaları büyüdükçe context'e sığdırmak zorlaşıyor
- Güvenlik açıkları (exposed API key, unprotected route) gözden kaçıyor

## Çözüm

nextscan tek bir `scan` komutu ile projeyi analiz eder ve şu formatta kompakt bir özet döndürür:

```
🔍 nextscan complete

📁 Routes (47)
├── Server: 32 | Client: 15
├── Dynamic: 8 | Static: 24 | API: 12
├── Layouts: 5 | Loading: 3 | Error: 2
└── Middleware: 1 (matcher: /dashboard/*)

🔌 API Endpoints (12)
├── GET  /api/users         → auth ✓ | zod ✓
├── POST /api/users         → auth ✓ | zod ✓
├── GET  /api/posts         → auth ✗ ⚠️ | zod ✗
├── DELETE /api/admin/users  → auth ✓ | zod ✗
└── ... (8 more)

🗄️ Database Schema
├── ORM: Prisma
├── Models: 8 | Relations: 12
├── User → Post (1:N) → Comment (1:N)
├── User → Session (1:N)
├── Orphan tables: AuditLog, TempData ⚠️
└── Missing indexes: Post.authorId, Comment.postId ⚠️

🔒 Security (4 issues)
├── ⚠️ NEXT_PUBLIC_STRIPE_SECRET in .env.local (should not be public)
├── ⚠️ /api/posts has no auth middleware
├── ⚠️ /api/webhook missing rate limit
└── ⚠️ API key literal found in src/lib/payment.ts:42
```

## Teknik Mimari

### Stack

- **Runtime**: Node.js 18+
- **Dil**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **AST Parse**: `ts-morph` (TypeScript/JSX analizi için)
- **Schema Parse**: Prisma → `@prisma/internals` veya regex-based parse, Drizzle → ts-morph ile AST analizi
- **Transport**: stdio (JSON-RPC)
- **Paket yöneticisi**: npm
- **Test**: vitest

### Proje Yapısı

```
nextscan/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   └── scan.ts           # Ana scan tool tanımı
│   ├── analyzers/
│   │   ├── routes.ts         # app/ dizin analizi
│   │   ├── api.ts            # API endpoint analizi
│   │   ├── schema.ts         # Prisma + Drizzle şema analizi
│   │   └── security.ts       # Güvenlik taraması
│   ├── parsers/
│   │   ├── typescript.ts     # ts-morph ile AST parse utilities
│   │   ├── prisma.ts         # Prisma schema parser
│   │   └── drizzle.ts        # Drizzle schema parser
│   ├── formatters/
│   │   └── compact.ts        # Kompakt metin çıktı formatlayıcı
│   └── utils/
│       ├── fs.ts             # Dosya sistemi yardımcıları
│       └── detect.ts         # Proje yapısı algılama (ORM, src/ vs app/)
├── tests/
│   ├── analyzers/
│   │   ├── routes.test.ts
│   │   ├── api.test.ts
│   │   ├── schema.test.ts
│   │   └── security.test.ts
│   └── fixtures/             # Test için örnek Next.js proje yapıları
│       ├── basic-app/
│       ├── prisma-app/
│       └── drizzle-app/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── LICENSE                   # MIT
└── README.md
```

### MCP Server Tanımı

```typescript
// src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
    name: 'nextscan',
    version: '1.0.0',
})

// Ana tool: scan
server.tool(
    'scan',
    {
        path: z.string().optional().describe('Next.js proje root dizini. Varsayılan: cwd'),
        focus: z.enum(['all', 'routes', 'api', 'schema', 'security']).optional().describe('Sadece belirli bir analizi çalıştır. Varsayılan: all'),
    },
    async ({ path, focus }) => {
        // analyzer'ları çalıştır, formatla, döndür
    },
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

## Modül Detayları

### 1. Route Analyzer (`analyzers/routes.ts`)

**Taranacak dizin**: `app/` (veya `src/app/`)

**Algılanacaklar**:

- `page.tsx` → route
- `layout.tsx` → layout
- `loading.tsx` → loading state
- `error.tsx` → error boundary
- `not-found.tsx` → 404 handler
- `route.ts` → API route
- `middleware.ts` → middleware (root'ta)
- `template.tsx` → template
- Dynamic segments: `[param]`, `[...param]`, `[[...param]]`
- Route groups: `(group)`
- Parallel routes: `@slot`
- Intercepting routes: `(.)`, `(..)`, `(..)(..)`

**Server vs Client algılama**:

- Dosyanın başında `"use client"` directive var mı?
- Eğer yoksa → server component (default)
- Eğer varsa → client component

**Çıktı formatı**:

```
📁 Routes (47)
├── Server: 32 | Client: 15
├── Dynamic: 8 | Static: 24 | API: 12
├── Layouts: 5 | Loading: 3 | Error: 2
├── Parallel: 2 (@modal, @sidebar)
├── Intercepting: 1
└── Middleware: 1 (matcher: /dashboard/*)
```

### 2. API Endpoint Analyzer (`analyzers/api.ts`)

**Taranacak dosyalar**: `app/**/route.ts`, `app/**/route.js`

**Her endpoint için algılanacaklar**:

- HTTP metodları: dosyada export edilen `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Auth kontrolü: `auth()`, `getSession()`, `getServerSession()`, `currentUser()`, `clerk`, `supabase.auth`, `lucia`, middleware'den auth — import ve çağrı bazlı algılama
- Input validation: `zod`, `yup`, `joi`, `valibot` schema kullanımı — `z.object`, `schema.parse`, `schema.validate` gibi pattern'ler
- Rate limiting: `rateLimit`, `limiter`, `upstash` gibi pattern'ler

**Çıktı formatı**:

```
🔌 API Endpoints (12)
├── GET    /api/users              → auth ✓ | zod ✓
├── POST   /api/users              → auth ✓ | zod ✓
├── GET    /api/posts              → auth ✗ ⚠️ | zod ✗
├── GET    /api/posts/[id]         → auth ✗ ⚠️ | zod ✗
├── POST   /api/posts              → auth ✓ | zod ✓
├── DELETE /api/admin/users/[id]   → auth ✓ | zod ✗
├── POST   /api/webhook/stripe     → auth ✗ | zod ✗ | rate-limit ✗ ⚠️
└── GET    /api/health             → auth ✗ | public
```

**Public endpoint algılama**: `/api/health`, `/api/webhook/*`, `/api/public/*` gibi path'ler auth uyarısı vermemeli. Bunlar için configürasyon desteği olmalı.

### 3. Schema Analyzer (`analyzers/schema.ts`)

**Prisma desteği**:

- `prisma/schema.prisma` dosyasını parse et
- Model isimleri, field'lar, relation'lar
- `@relation`, `@id`, `@unique`, `@index` directive'leri
- Orphan table tespiti (hiçbir relation'ı olmayan model)
- Missing index tespiti (foreign key field'larda `@index` yok)

**Drizzle desteği**:

- `src/db/schema.ts` veya `drizzle/schema.ts` (veya `schema/*.ts` barrel export) dosyalarını ts-morph ile parse et
- `pgTable`, `mysqlTable`, `sqliteTable` çağrılarını bul
- `references(() => table.id)` ile relation'ları çıkar
- `.index()` kullanımlarını kontrol et

**ORM algılama**:

- `package.json`'da `prisma` veya `@prisma/client` varsa → Prisma
- `package.json`'da `drizzle-orm` varsa → Drizzle
- İkisi de varsa → ikisini de tara

**Çıktı formatı**:

```
🗄️ Database Schema
├── ORM: Prisma
├── Models: 8 | Relations: 12
├── User → Post (1:N) → Comment (1:N)
├── User → Session (1:N)
├── Post → Tag (N:N via PostTag)
├── Orphan tables: AuditLog, TempData ⚠️
└── Missing indexes: Post.authorId, Comment.postId ⚠️
```

### 4. Security Analyzer (`analyzers/security.ts`)

**Taramalar**:

**a) Environment variable sızıntısı**:

- `NEXT_PUBLIC_` prefix'i ile başlayan ama secret olması gereken değişkenler:
    - `*SECRET*`, `*PASSWORD*`, `*PRIVATE*`, `*TOKEN*` (API_TOKEN hariç bazı public token'lar olabilir)
- `.env`, `.env.local`, `.env.production` dosyalarını tara

**b) Hardcoded secret'lar**:

- Kaynak kodda (`src/`, `app/`, `lib/`, `utils/`) string literal olarak:
    - `sk_live_`, `sk_test_` (Stripe)
    - `ghp_`, `gho_` (GitHub)
    - `xoxb-`, `xoxp-` (Slack)
    - `AKIA` (AWS)
    - Genel pattern: uzun alphanumeric string'ler assignment'larda (`apiKey = "..."`, `secret: "..."`)
- `.gitignore`'da `.env` var mı kontrolü

**c) Korumasız API route'ları**:

- API analyzer'dan gelen auth bilgisi ile çapraz kontrol
- Public olması normal olan path'leri hariç tut (health, webhook)
- Auth middleware kapsamında olan route'ları hariç tut

**d) Diğer kontroller**:

- `next.config.js`'de `headers()` ile security header'lar tanımlı mı (CORS, CSP vs.)
- `middleware.ts` var mı ve nereleri koruyor
- `.env.example` var mı (takım çalışması için)

**Çıktı formatı**:

```
🔒 Security (4 issues)
├── 🔴 CRITICAL: sk_live_ literal found in src/lib/stripe.ts:15
├── 🟡 WARNING: NEXT_PUBLIC_DB_PASSWORD in .env.local
├── 🟡 WARNING: /api/posts has no auth check
├── 🟡 WARNING: /api/webhook/stripe has no rate limiting
├── ℹ️ INFO: No security headers in next.config
└── ℹ️ INFO: .env.example missing
```

## Kurulum ve Kullanım

### npm ile kurulum

```bash
claude mcp add nextscan -- npx -y nextscan
```

### Kullanım

Claude Code'da doğal dille:

```
"Scan my project"
"Analyze the API routes"
"Check security issues"
"Show me the database schema"
```

Veya focus parametresi ile:

```
scan({ focus: "security" })
scan({ focus: "api" })
scan({ focus: "schema" })
```

## Performans Hedefleri

- Orta büyüklükte proje (50 route, 20 API, 15 model): < 3 saniye
- Büyük proje (200+ route): < 10 saniye
- Context tasarrufu: Ham dizin/dosya dump'ına kıyasla %90+ token tasarrufu
- Çıktı boyutu: Maksimum 2-3 KB (tipik olarak 1 KB altı)

## npm Paketi Bilgileri

- **Paket adı**: `nextscan`
- **Binary**: `nextscan` (package.json `bin` field)
- **Entry**: `dist/index.js` (TypeScript → JavaScript derleme)
- **Engine**: Node.js 18+
- **Lisans**: MIT

## README.md İçeriği

README şu yapıda olmalı (claude-context-mode'u referans al, benzer ton ve yapı):

1. **Başlık + tagline**: "nextscan — X-ray vision for your Next.js app"
2. **Before/After karşılaştırma tablosu**: Context token tasarrufunu gösteren tablo
3. **Hızlı kurulum**: Tek satır `claude mcp add` komutu
4. **Ne yapıyor**: Kısa açıklama + örnek çıktı
5. **Araçlar**: `scan` tool'unun parametreleri ve açıklaması
6. **Örnek promptlar**: Doğal dille kullanım örnekleri
7. **Nasıl çalışır**: Basit mimari diyagramı (ASCII)
8. **Gereksinimler**: Node.js 18+, Claude Code
9. **Lisans**: MIT

README tonu: teknik ama samimi, gereksiz detay yok, örnekler net.

## Test Stratejisi

Her analyzer için fixture-based testler:

```
tests/fixtures/
├── basic-app/           # Minimal Next.js app/ yapısı
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── api/
│   │       ├── users/route.ts
│   │       └── posts/route.ts
│   ├── middleware.ts
│   ├── next.config.js
│   ├── package.json
│   └── .env.local
├── prisma-app/          # Prisma şemalı proje
│   ├── prisma/schema.prisma
│   └── ...
├── drizzle-app/         # Drizzle şemalı proje
│   ├── src/db/schema.ts
│   └── ...
└── insecure-app/        # Güvenlik sorunları olan proje
    ├── app/api/open-route/route.ts  # Auth yok
    ├── src/lib/stripe.ts            # Hardcoded key
    └── .env.local                   # NEXT_PUBLIC_SECRET
```

**Test kapsamı hedefi**: %90+ (analyzer'lar, parser'lar, formatter)

## v1.0 Sonrası Yol Haritası (Scope Dışı)

Bu özellikler MVP'de YOK, ama ileride eklenebilir:

- HTML dashboard raporu (interaktif, paylaşılabilir)
- Bundle size analizi (`next build` çıktısı parse)
- Server/client component optimizasyon önerileri
- Performance analizi (dynamic vs static sayfa önerileri)
- Dependency audit (outdated, vulnerable paketler)
- CI/CD entegrasyonu (GitHub Action olarak)
- `watch` modu (dosya değişikliklerinde otomatik re-scan)
- Config linter (next.config.js tutarsızlık tespiti)
