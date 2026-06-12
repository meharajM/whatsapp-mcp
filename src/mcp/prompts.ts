import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    ErrorCode,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';

const AUTOPILOT_PROMPT_NAME = 'whatsapp-autopilot';

const AUTOPILOT_PROMPT = `You are connected to the user through the whatsapp-mcp server.

Workflow rules:
- Before sending or asking anything on WhatsApp, prefer the MCP tools from this server instead of asking in the IDE chat.
- If a WhatsApp tool reports that authentication is required, show the returned QR image to the user, wait for them to scan it, then retry the original tool.
- Use ask_question for confirmations, approvals, permissions, and clarifications.
- Use send_message for one-way status updates that do not need a reply.
- After WhatsApp is connected, keep all runtime human-in-the-loop interactions on WhatsApp unless the server itself is unavailable.
- Use get_status to inspect connection and queue state when needed.`;

export function registerPrompts(server: Server): void {
    server.registerCapabilities({
        prompts: {
            listChanged: false,
        },
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: [
            {
                name: AUTOPILOT_PROMPT_NAME,
                title: 'WhatsApp Autopilot',
                description: 'Guidance for agents to use WhatsApp tools for connect, notifications, and human approvals.',
            },
        ],
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        if (request.params.name !== AUTOPILOT_PROMPT_NAME) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Unknown prompt: "${request.params.name}".`,
            );
        }

        return {
            description: 'Recommended operating instructions for whatsapp-mcp.',
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: AUTOPILOT_PROMPT,
                    },
                },
            ],
        };
    });
}
