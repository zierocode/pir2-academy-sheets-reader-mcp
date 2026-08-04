import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  spreadsheet: z.string().trim().min(1).max(2048),
  sheetName: z.string().trim().min(1).optional(),
  maxRows: z.number().int().min(1).max(200).default(50).optional(),
  maxColumns: z.number().int().min(1).max(50).default(25).optional(),
  valueMode: z.enum(["typed", "display", "formula"]).default("typed").optional()
}).strict();

export function createReadSheetSampleTool(): UnboundToolDefinition {
  return {
    name: "read_sheet_sample",
    description: "Return a bounded sample for schema inspection.",
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

      return context.success(await context.services.sheets.readSample(parsed.data));
    }
  };
}
