# WhatsApp MCP Server — Architecture v2.0

## 1. Original Requirements

Build a WhatsApp MCP server enabling **any AI agent** to interact with the user during agentic execution for:

- **Permissions** — "Can I delete these files?"
- **Confirmations** — "I'm about to deploy, proceed?"
- **Answers** — "Which database should I target?"

Library: `@whiskeysockets/baileys`. Priority: AI user's experience.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                 AI Agent (Claude / Cursor / etc.)                 │
│                                                                   │
│   Calls MCP tools via stdio JSON protocol:                        │
│     • get_status()                                                │
│     • send_message(message, to?, format?)                         │
│     • ask_question(question, to?, timeout_minutes?)               │
└──────────────────────┬───────────────────────────────────────────┘
                       │  stdio  (MCP JSON protocol)
┌──────────────────────▼───────────────────────────────────────────┐
│                   WhatsApp MCP Server v2.0                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  src/index.ts          Entry point — wires modules together  │ │
│  └───────────────────────┬─────────────────────────────────────┘ │
│                          │                                        │
│  ┌───────────────────────▼─────────────────────────────────────┐ │
│  │  src/mcp/server.ts     MCP Server (StdioServerTransport)     │ │
│  │  src/mcp/tools/                                              │ │
│  │    registry.ts         Registers tools with the server       │ │
│  │    send-message.ts     send_message handler                  │ │
│  │    ask-question.ts     ask_question handler                  │ │
│  │    get-status.ts       get_status handler                    │ │
│  └───────────────────────┬─────────────────────────────────────┘ │
│                          │                                        │
│  ┌───────────────────────▼─────────────────────────────────────┐ │
│  │  src/utils/question-queue.ts   FIFO queue with Q-labels      │ │
│  └───────────────────────┬─────────────────────────────────────┘ │
│                          │                                        │
│  ┌───────────────────────▼─────────────────────────────────────┐ │
│  │  src/whatsapp/client.ts   Baileys WebSocket client           │ │
│  │    • QR on stderr (never stdout)                             │ │
│  │    • Auto-reconnect on disconnect                            │ │
│  │    • Delivery receipt tracking                               │ │
│  └───────────────────────┬─────────────────────────────────────┘ │
│                          │                                        │
│  ┌───────────────────────▼─────────────────────────────────────┐ │
│  │  src/config.ts         Env loading & shared constants         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────────────────┘
                       │  WhatsApp Web WebSocket (E2E encrypted)
┌──────────────────────▼───────────────────────────────────────────┐
│              WhatsApp Servers  →  User's Phone                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Breakdown

### `src/index.ts` — Entry Point
Minimal. Just calls `connect()` then `createAndStartServer()`.

### `src/config.ts` — Configuration
- Loads `.env` relative to build directory (works regardless of launch CWD)
- Validates `WHATSAPP_TARGET_NUMBER` and auto-appends `@s.whatsapp.net`
- Exports `config.targetNumber`, `config.authDir`, `config.deliveryTimeoutMs`

### `src/whatsapp/client.ts` — Baileys Client
- `connect()` — opens WebSocket, prints QR to stderr, persists creds
- `isConnected()` — boolean connection state
- `getSocket()` — exposes socket to tool handlers
- `waitForDelivery(msgId, ms)` — receipt waiter per message ID
- Auto-reconnects unless session was explicitly logged out
- Routes incoming messages to `question-queue.ts`

### `src/utils/question-queue.ts` — FIFO Question Queue
- `enqueue(question, timeoutMs)` → `{ label, promise }`
  - Increments a counter and extracts a heading from the question's first sentence
  - Label format: `[Q3: Deploy to production?]`
  - Promise resolves when `resolveNext()` is called with a reply, or rejects on timeout
- `resolveNext(reply)` — shifts the oldest item off the queue and resolves its promise
- `getQueueLength()` / `getPendingLabels()` — for `get_status`

### `src/mcp/server.ts` — MCP Server
Creates the MCP `Server` instance, attaches tool registry, connects `StdioServerTransport`.

### `src/mcp/tools/registry.ts` — Tool Registry
Single `switch` dispatcher. Adding a new tool = add one `import` + one `case`.

### `src/mcp/tools/send-message.ts`
| Feature | Implementation |
|---|---|
| Optional `to` | Normalizes any number format to `@s.whatsapp.net` |
| WhatsApp markdown | Passed through as-is (WA renders `*bold*`, `_italic_` natively) |
| Delivery receipt | `waitForDelivery(msgId, 3000ms)` — returns `{ sent, delivered }` to agent |

### `src/mcp/tools/ask-question.ts`
| Feature | Implementation |
|---|---|
| Q-label heading | `[Q{n}: first sentence of question]` prepended to message |
| Auto-format | Regex detects confirm/approve/delete/proceed/? → appends `✅ yes / ❌ no` hint |
| Optional `to` | Same number normalization as send_message |
| Timeout | Default 5 min, configurable via `timeout_minutes` |
| Concurrent support | FIFO queue — each concurrent call gets its own label and promise |

### `src/mcp/tools/get-status.ts`
Returns: `{ connected, targetNumber, pendingQuestions, pendingLabels, status }`.

---

## 4. Requirements vs Implementation

| Requirement | Status | Where |
|---|---|---|
| MCP server over stdio | ✅ | `mcp/server.ts` |
| AI sends one-way notifications | ✅ | `send_message` tool |
| AI asks questions, blocks for reply | ✅ | `ask_question` tool + queue |
| Uses `@whiskeysockets/baileys` | ✅ | `whatsapp/client.ts` |
| Session persisted (QR once) | ✅ | `useMultiFileAuthState` in `authDir` |
| QR on stderr (never corrupts MCP) | ✅ | `qrcode.generate → console.error` |
| Auto-reconnect | ✅ | `connect()` called recursively |
| Only target number processed | ✅ | Filter by `config.targetNumber` |
| Concurrent questions labelled | ✅ | `[Q1: heading]` prefix system |
| Delivery receipts in response | ✅ | `message-receipt.update` event + waiter map |
| Yes/no auto-formatting | ✅ | Pattern match → append ✅/❌ hint |
| Optional `to` param | ✅ | Both tools accept it |
| Health-check tool | ✅ | `get_status` tool |
| Modular codebase | ✅ | 7 focused modules, clear separation |

---

## 5. Remaining Known Issues

### 🔴 Gap 1 — 405 on Initial Auth (Network Issue, Not Code)
**What:** Fresh `baileys_auth_info` sometimes triggers `Connection Failure 405` on macOS due to WhatsApp-server-side routing restrictions. The QR does display on stderr.  
**Fix:** Try mobile hotspot / different network for the first-time scan. Once `baileys_auth_info/` is populated, the session persists across restarts with no QR needed.

---

## 6. MCP Client Configuration

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/absolute/path/to/whatsapp-mcp/build/index.js"]
    }
  }
}
```

All internal logs, errors, and the QR code print to **stderr** — agents never see them in the MCP response stream.

---

## 7. File Structure

```
whatsapp-mcp/
├── src/
│   ├── index.ts                  ← Entry point
│   ├── config.ts                 ← Env + constants
│   ├── whatsapp/
│   │   └── client.ts             ← Baileys client, receipt tracking
│   ├── mcp/
│   │   ├── server.ts             ← MCP server + transport
│   │   └── tools/
│   │       ├── registry.ts       ← Tool dispatcher
│   │       ├── send-message.ts   ← send_message tool
│   │       ├── ask-question.ts   ← ask_question tool
│   │       └── get-status.ts     ← get_status tool
│   └── utils/
│       └── question-queue.ts     ← FIFO queue with labels + timeout
├── build/                        ← Compiled output (run by agents)
├── baileys_auth_info/            ← WhatsApp session (gitignored)
├── .env                          ← WHATSAPP_TARGET_NUMBER (gitignored)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```
