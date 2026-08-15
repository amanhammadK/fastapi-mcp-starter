import { z } from "zod";

export const RegisterEndpointSchema = z.object({
  path: z.string().min(1, "Path is required"),
  method: z.string().min(1, "Method is required"),
  description: z.string().min(1, "Description is required"),
});

export const LogRequestSchema = z.object({
  path: z.string().min(1),
  method: z.string().min(1),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().min(0),
});
