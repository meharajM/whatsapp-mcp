/**
 * registry.ts
 *
 * Registers all MCP tools with the server in one place.
 * Adding a new tool = import it here and add to the switch.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { sendMessageTool, handleSendMessage } from './send-message.js';
import { askQuestionTool, handleAskQuestion } from './ask-question.js';
import { getStatusTool, handleGetStatus } from './get-status.js';
import { connectTool, handleConnect } from './connect.js';
import { disconnectTool, handleDisconnect } from './disconnect.js';

export const ALL_TOOLS = [
    connectTool,
    disconnectTool,
    sendMessageTool,
    askQuestionTool,
    getStatusTool,
];

export function registerTools(server: Server): void {
    // ListTools — advertise available tools to the agent
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: ALL_TOOLS,
    }));

    // CallTool — dispatch to the correct handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args = {} } = request.params;

        switch (name) {
            case 'send_message':
                return handleSendMessage(args as Record<string, unknown>);
            case 'ask_question':
                return await handleAskQuestion(args);
            case 'get_status':
                return await handleGetStatus();
            case 'connect':
                return await handleConnect();
            case 'disconnect':
                return await handleDisconnect();
            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: "${name}". Available tools: ${ALL_TOOLS.map((t) => t.name).join(', ')}.`,
                );
        }
    });
}
