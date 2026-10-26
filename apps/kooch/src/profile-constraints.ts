import { z } from 'zod';
import type { Answers } from './questions';
import type { AnswerRecord } from './form/contract';

const fields = ['age_exact', 'work_years', 'education', 'language_cefr', 'budget', 'monthly_income', 'annual_income'] as const;
export const profileRuleSchema = z.object({ field: z.enum(fields), operator: z.enum(['gte', 'lte', 'eq', 'in']),
  value: z.union([z.number().finite(), z.string().max(60), z.array(z.union([z.number().finite(), z.string().max(60)])).min(1).max(20)]),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), basis: z.enum(['gross', 'net']).optional(), language_code: z.string().regex(/^[a-z]{2}$/).optional(), scope_fa: z.string().min(1),
}).strict().superRefine((rule, ctx) => {
  const money = ['budget', 'monthly_income', 'annual_income'].includes(rule.field);
  if (money && (!rule.currency || typeof rule.value !== 'number') || rule.field.includes('income') && !rule.basis || rule.field === 'language_cefr' && !rule.language_code || rule.operator === 'in' && !Array.isArray(rule.value) || rule.operator !== 'in' && Array.isArray(rule.value))
    ctx.addIssue({ code: 'custom', message: 'Profile criterion needs an exact unit, scope and comparable value' });
});
export type ProfileRule = z.infer<typeof profileRuleSchema>;
type Money = { amount: number; currency: string };
type Interval = { min: number; max: number };
export type ScreeningProfile = Partial<Record<typeof fields[number], number | string | Money | Interval>> & { language_code?: string; income_basis?: 'gross' | 'net' };

export function screeningProfile(answers: Answers, records: Record<string, AnswerRecord> = {}): ScreeningProfile {
  const profile: ScreeningProfile = {};
  if (answers.age === 'under-30') profile.age_exact = { min: 0, max: 29 };
  if (answers.age === '30-39') profile.age_exact = { min: 30, max: 39 };
  if (answers.age === '40-plus') profile.age_exact = { min: 40, max: 120 };
  if (answers.work === 'none') profile.work_years = 0;
  if (answers.work === 'under-3') profile.work_years = { min: 0, max: 2.999 };
  if (answers.work === '3-plus') profile.work_years = { min: 3, max: 80 };
  if (answers.education !== 'unknown') profile.education = answers.education;
  if (answers.budget) profile.budget = answers.budget;
  for (const field of [...fields, 'language_code', 'income_basis'] as const) {
    const record = records[field];
    if (!record || record.needs_review || record.answer.state !== 'known') continue;
    const value = record.answer.value;
    if (['age_exact', 'work_years'].includes(field) && typeof value === 'number' && Number.isFinite(value) && value >= 0) profile[field as 'age_exact' | 'work_years'] = value;
    else if (['education', 'language_cefr'].includes(field) && typeof value === 'string') profile[field as 'education' | 'language_cefr'] = value;
    else if (['budget', 'monthly_income', 'annual_income'].includes(field) && typeof value === 'object') profile[field as 'budget' | 'monthly_income' | 'annual_income'] = value;
    else if (field === 'language_code' && typeof value === 'string') profile.language_code = value;
    else if (field === 'income_basis' && (value === 'gross' || value === 'net')) profile.income_basis = value;
  }
  return profile;
}

export function evaluateProfileRule(rule: ProfileRule, profile: ScreeningProfile): boolean | null {
  const value = profile[rule.field]; if (value === undefined) return null;
  if (rule.field === 'language_cefr' && profile.language_code !== rule.language_code || rule.basis && profile.income_basis !== rule.basis) return null;
  let actual: number | string | Interval;
  if (typeof value === 'object' && 'amount' in value) {
    if (value.currency !== rule.currency) return null; // No implicit FX or period conversion.
    actual = value.amount;
  } else actual = value;
  if (rule.operator === 'in') return Array.isArray(rule.value) && (typeof actual === 'number' || typeof actual === 'string') ? rule.value.includes(actual) : null;
  let expected = rule.value;
  if (rule.field === 'language_cefr') {
    const cefr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    if (typeof actual !== 'string' || typeof expected !== 'string' || !cefr.includes(actual) || !cefr.includes(expected)) return null;
    actual = cefr.indexOf(actual); expected = cefr.indexOf(expected);
  }
  if (typeof actual === 'string' || typeof expected === 'string') return rule.operator === 'eq' && typeof actual === typeof expected ? actual === expected : null;
  if (typeof expected !== 'number') return null;
  const interval = typeof actual === 'number' ? { min: actual, max: actual } : actual;
  if (rule.operator === 'gte') return interval.min >= expected ? true : interval.max < expected ? false : null;
  if (rule.operator === 'lte') return interval.max <= expected ? true : interval.min > expected ? false : null;
  return interval.min === interval.max && interval.min === expected ? true : expected < interval.min || expected > interval.max ? false : null;
}
