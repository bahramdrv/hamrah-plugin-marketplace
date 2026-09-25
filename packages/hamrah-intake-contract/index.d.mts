export const contractVersion: '1.0.0';
export interface ProfilePreview {
  contractVersion: string;
  fields: Array<{
    sourcePath: string;
    factId: string;
    value: string | number | null;
    state: 'Known' | 'Unknown' | 'Conflicting';
    provenance: 'applicant-reported';
    importance: 'critical' | 'high' | 'medium' | 'low' | null;
  }>;
  issues: Array<{ path: string; reason: string }>;
  unmappedPaths: string[];
}
export function previewProfile(profile: unknown): ProfilePreview;
