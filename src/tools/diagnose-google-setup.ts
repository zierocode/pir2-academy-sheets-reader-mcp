import { z } from "zod";
import type { ToolExecutionContext, UnboundToolDefinition } from "../server.js";

const inputSchema = z.object({}).strict();

export function createDiagnoseGoogleSetupTool(): UnboundToolDefinition {
  return {
    name: "diagnose_google_setup",
    description: "ตรวจหาสาเหตุที่ Sheets MCP ใช้งานไม่ได้ พร้อมบอกวิธีแก้ทีละขั้น โดยไม่เปิดเผย secret",
    inputSchema,
    handler: async (input: unknown, context: ToolExecutionContext) => {
      if (!inputSchema.safeParse(input).success) return context.failure("GOOGLE_API_ERROR");
      return context.success(await context.services.diagnostics.run());
    }
  };
}
