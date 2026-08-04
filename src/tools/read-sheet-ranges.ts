import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  spreadsheet: z.string().trim().min(1).max(2048),
  ranges: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  valueMode: z.enum(["typed", "display", "formula"]).default("typed").optional()
}).strict();

export function createReadSheetRangesTool(): UnboundToolDefinition {
  return {
    name: "read_sheet_ranges",
    description: "Read explicit bounded A1 ranges after inspection.",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      const parsed = inputSchema.safeParse(input);

      if (!parsed.success) {
        return context.failure("INVALID_RANGE");
      }

      const authorizationFailure = await context.requireReadAuthorization();

      if (authorizationFailure) {
        return authorizationFailure;
      }

      return context.success(await context.services.sheets.readRanges(parsed.data));
    }
  };
}
