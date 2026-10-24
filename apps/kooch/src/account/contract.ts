import { z } from 'zod';
import { answersSchema } from '../questions';
import type { FormState } from '../form/contract';
export const consentVersion = 'account-save-1';
export const credentialsSchema = z.object({ email: z.email().max(254).transform(s => s.trim().toLowerCase()), password: z.string().min(12).max(128) }).strict();
export const caseInputSchema = z.object({
  answers: answersSchema, step: z.number().int().min(0).max(7),
  expected_revision: z.number().int().nonnegative(), request_id: z.uuid(),
  consent: z.literal(consentVersion),
}).strict();
export type CaseInput = z.infer<typeof caseInputSchema>;
export type SavedCase = { form?: FormState; id: string; revision: number; answers: z.infer<typeof answersSchema>; step: number; last_activity_at: string; delete_after: string; consent_version: string };
export class AccountError extends Error {
  constructor(public code: string, public status: number, public userMessage: string) { super(code); }
}
export const unauthorized = () => new AccountError('unauthorized', 401, 'برای ادامه وارد حساب شو.');
