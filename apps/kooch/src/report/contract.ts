import type { GuidanceReport } from './evaluate';
import { z } from 'zod';
const date = z.iso.date().nullable().optional();
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable().optional();
const money = z.number().finite().min(0).max(1e9).multipleOf(0.01).nullable().optional();
export const reportFactsSchema = z.object({
  application_scope: choice(['iran_entry_full_time_degree', 'other']),
  passport: choice(['yes', 'no']), cas: choice(['valid_unused', 'absent']),
  cas_issued_on: date, course_starts_on: date, application_on: date,
  english: choice(['cas_b2_all_skills', 'not_met', 'other']),
  atas: choice(['not_required_confirmed', 'valid_certificate', 'required_missing']), atas_issued_on: date,
  tb: choice(['not_required_after_check', 'valid_certificate', 'required_missing']), tb_issued_on: date,
  finance_method: choice(['cash', 'loan_or_sponsorship', 'exempt']),
  location: choice(['london', 'outside_london']), course_months: z.number().int().min(1).max(120).nullable().optional(),
  tuition_gbp: money, tuition_paid_gbp: money, sponsor_accommodation_paid_gbp: money,
  funds_held_days: z.number().int().min(0).max(36500).nullable().optional(), funds_period_ends_on: date,
  dependants: z.number().int().min(0).max(20).nullable().optional(),
}).strict();
export type ReportFacts = z.infer<typeof reportFactsSchema>;
export const reportInputSchema = z.object({
  expected_revision: z.number().int().positive(), request_id: z.uuid(),
}).strict();
export type ReportInput = z.infer<typeof reportInputSchema>;

export type ReportState = { current: boolean; evidence_current: boolean; answers_current: boolean; latest_version: number };
export type ReportChange = 'initial' | 'answers_changed' | 'evidence_changed' | 'recreated';
export type ReportHistoryItem = Pick<GuidanceReport, 'id' | 'version' | 'created_at' | 'case_revision' | 'coverage'> & {
  changes: ReportChange[]; report_state: ReportState;
};
export const changeLabels: Record<ReportChange, string> = {
  initial: 'نخستین کارنامهٔ ذخیره‌شده', answers_changed: 'پاسخ‌های پرونده تغییر کرده‌اند',
  evidence_changed: 'شواهد یا وضعیت بازبینی آن‌ها تغییر کرده است', recreated: 'ساخت دوباره از همان پاسخ‌ها و نسخهٔ شواهد',
};

export type EvidenceReview = { routeIds: readonly string[]; retrievalFailed: boolean; discoverySnapshot?: unknown };
