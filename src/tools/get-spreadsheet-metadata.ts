import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({
  spreadsheet: z.string().min(1).max(2048).refine((value) => value.trim() === value)
}).strict();

export function createGetSpreadsheetMetadataTool(): UnboundToolDefinition {
  return {
    name: "get_spreadsheet_metadata",
    description: "ตรวจชื่อไฟล์และรายการ Tab จาก Google Sheets URL หรือ spreadsheet ID",
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
