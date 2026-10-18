import { z } from 'zod';

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const annotationSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('arrow'),
    label: z.string().optional(),
    from: pointSchema,
    to: pointSchema,
  }),
  z.object({
    id: z.string(),
    kind: z.literal('circle'),
    label: z.string().optional(),
    center: pointSchema,
    radius: z.number().positive(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('explanation'),
    label: z.string().optional(),
    anchor: pointSchema,
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('focus'),
    label: z.string().optional(),
    target: rectSchema,
  }),
]);

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.number(),
});

export const explainRequestSchema = z.object({
  sessionId: z.string(),
  imageBase64: z.string().min(1),
  selection: rectSchema.optional(),
  prompt: z.string().optional(),
});

export const explainResponseSchema = z.object({
  summary: z.string(),
  annotations: z.array(annotationSchema),
  assistantMessage: chatMessageSchema,
});

export const chatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string().min(1),
  branchAnnotationId: z.string().optional(),
});

export const chatResponseSchema = z.object({
  message: chatMessageSchema,
});

export type ExplainRequestInput = z.infer<typeof explainRequestSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
