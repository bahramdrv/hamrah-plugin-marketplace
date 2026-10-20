import { z } from 'zod';
import { answerSchema, type FormAnswer } from './contract';
export const interpretationInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), expected_revision: z.number().int().positive(), request_id: z.uuid(), question_id: z.string().max(50), question_version: z.number().int().positive(), text: z.string().trim().min(1).max(2000), disclosure: z.literal('answer-interpretation-1') }).strict(),
  z.object({ action: z.literal('reject'), request_id: z.uuid(), expected_revision: z.number().int().positive(), draft_id: z.uuid() }).strict(),
  z.object({ action: z.literal('confirm'), request_id: z.uuid(), question_id: z.string().max(50), question_version: z.number().int().positive(), expected_revision: z.number().int().positive(), draft_id: z.uuid(), answer: answerSchema, confirm_conflict: z.boolean().default(false) }).strict(),
]);
export type InterpretationInput = z.infer<typeof interpretationInputSchema>;
export type InterpretationResult = { status: string; accounting_policy?: string; accounting_id?: string; answer?: FormAnswer; summary?: string; ambiguity?: string };
export type InterpretationDraft = InterpretationResult & { id: string; question_id: string; question_version: number; text: string; disclosure: 'answer-interpretation-1'; revision: number };
