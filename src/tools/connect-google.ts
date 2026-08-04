import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  confirm: z.literal(true)
}).strict();

export function createConnectGoogleTool(): UnboundToolDefinition {
  return {
    name: "connect_google",
    description: "Start the explicit learner-approved OAuth flow.",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      const parsed = inputSchema.safeParse(input);

      if (!parsed.success) {
        return context.failure("AUTH_REQUIRED");
      }

      return context.success(
        await context.services.oauth.start(parsed.data.confirm, { waitForAuthorization: true })
      );
    }
  };
}
