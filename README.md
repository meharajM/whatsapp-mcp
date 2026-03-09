# WhatsApp MCP Server

This is an MCP (Model Context Protocol) server that allows AI agents to interact directly with the user via WhatsApp. This is especially useful for getting runtime confirmations, asking for permissions, or getting inputs during a long-running execution.

## Using with AI Agents

Since this package is published to NPM, you can run it directly via `npx` in your cursor or claude configuration.

### Cursor / Claude Configuration

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "whatsapp-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@mhrj/whatsapp-mcp"
      ],
      "env": {
        "WHATSAPP_TARGET_NUMBER": "1234567890@s.whatsapp.net"
      }
    }
  }
}
```

> **Note about Allowed Numbers**: `WHATSAPP_TARGET_NUMBER` is the *default* recipient for all messages. However, if your target is a Whatsapp Group, any member of the group would be able to answer the AI by default. To restrict replies *only* to specific numbers (to prevent unauthorized people from answering), you can optionally add a comma-separated list of numbers as an environment variable: `"WHATSAPP_ALLOWED_NUMBERS": "123@s.whatsapp.net,456@s.whatsapp.net"`. If set, the AI will ONLY honor responses from these specific matching users.

> **Troubleshooting `npx: executable file not found in $PATH` or `env: node: No such file or directory`**: 
> If your IDE/Agent complains it cannot find `npx` or `node`, it's because GUI apps (like Cursor) don't inherit your terminal's `$PATH`. To fix this, explicitly pass your `PATH` in the MCP `env` config.
> ```json
>       "env": {
>         "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
>         "WHATSAPP_TARGET_NUMBER": "1234567890@s.whatsapp.net"
>       }
> ```

### Authentication (First time only)

The very first time you use the MCP server, it needs to authenticate with WhatsApp Web:

1. Call the **`connect`** tool via your Agent.
2. The agent will return a QR code image inline in the UI. 
3. Open WhatsApp on your phone -> Linked Devices -> Link a Device, and scan the QR.
4. The authentication session is saved to your home directory (`~/.whatsapp-mcp/baileys_auth_info`), so you don't need to scan it again across restarts.

## Features & Tools

- **`connect`**: Connects to the WhatsApp network. If not logged in, generates a QR code image base64 directly into the MCP client UI for easy scanning.
- **`disconnect`**: Completely logs out of WhatsApp and invalidates the session credentials.
- **`send_message`**: Sends a one-way notification. Supports optional WhatsApp markdown mapping (`*bold*`).
- **`ask_question`**: Sends a prompt and blocks execution until a reply is received (with a timeout). Concurrent questions are smartly queued and tagged with references.
- **`get_status`**: Provides agent connection state monitoring.

## Local Development

If you'd like to run it locally from source:

1. Clone the repository and `npm install`
2. `npm run build`
3. Link via absolute path instead of `npx`.
