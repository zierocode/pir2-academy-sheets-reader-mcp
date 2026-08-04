import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  spreadsheet: z.string().trim().min(1).max(2048)
}).strict();

export function createGetSpreadsheetMetadataTool(): UnboundToolDefinition {
  return {
    name: "get_spreadsheet_metadata",
    description: "Resolve a spreadsheet URL or ID and list its tabs.",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      const parsed = inputSchema.safeParse(input);

      if (!parsed.success) {
        return context.failure("INVALID_SPREADSHEET_REFERENCE");
      }

      const authorizationFailure = await context.requireReadAuthorization();

      if (authorizationFailure) {
        return authorizationFailure;
      }

      return context.success(await context.services.sheets.getMetadata(parsed.data.spreadsheet));
    }
  };
}
