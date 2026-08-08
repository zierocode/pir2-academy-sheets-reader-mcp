import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  confirm: z.literal(true)
}).strict();

export function createConnectGoogleTool(): UnboundToolDefinition {
  return {
    name: "connect_google",
    description: "เริ่มเชื่อม Google OAuth หลังผู้เรียนยืนยัน โดยขอสิทธิ์อ่าน Google Sheet เท่านั้น",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      const parsed = inputSchema.safeParse(input);

      if (!parsed.success) {
        return context.failure("AUTH_REQUIRED");
      }

      return context.success(
        await context.services.oauth.start(parsed.data.confirm, {
          waitForAuthorization: true,
          ...(context.signal === undefined ? {} : { signal: context.signal })
        })
      );
    }
  };
}
