import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({}).strict();

export function createAuthStatusTool(): UnboundToolDefinition {
  return {
    name: "google_auth_status",
    description: "Verify configuration and token readiness without reading Sheet data.",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      if (!inputSchema.safeParse(input).success) {
        return context.failure("AUTH_REQUIRED");
      }

      return context.success(await context.services.oauth.status());
    }
  };
}
