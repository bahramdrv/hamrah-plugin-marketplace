import { previewProfile } from '@immi/hamrah-intake-contract';

/** Local development facade. This is deliberately not registered as a remote MCP tool. */
export function previewApplicationIntake(profile) {
  return previewProfile(profile);
}
