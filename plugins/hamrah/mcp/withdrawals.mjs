import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const LEDGER_VERSION = "1.0";
export const WITHDRAWAL_REASONS = ["privacy", "incorrect", "superseded", "other"];

// The append-only ledger sits beside the scanned datasets/ directory, e.g. data/community-signals/withdrawals.json.
export function ledgerPathFor(datasetsRoot) {
  return path.basename(path.resolve(datasetsRoot)) === "datasets"
    ? path.join(path.resolve(datasetsRoot), "..", "withdrawals.json")
    : null;
}

export function emptyLedger() {
  return { ledger_version: LEDGER_VERSION, withdrawals: [] };
}

function isEntry(entry) {
  return entry && typeof entry === "object"
    && (typeof entry.artifact_id === "string") !== (typeof entry.dataset_id === "string")
    && WITHDRAWAL_REASONS.includes(entry.reason)
    && typeof entry.withdrawn_at === "string";
}

// Reads the ledger and fails closed: an unreadable ledger must not silently re-expose withdrawn artifacts.
export function readWithdrawalLedger(ledgerPath) {
  if (!ledgerPath || !existsSync(ledgerPath)) return emptyLedger();
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch (error) {
    throw new Error(`Community signal withdrawal ledger is unreadable: ${error.message}`);
  }
  if (ledger?.ledger_version !== LEDGER_VERSION || !Array.isArray(ledger.withdrawals) || !ledger.withdrawals.every(isEntry)) {
    throw new Error("Community signal withdrawal ledger is malformed.");
  }
  return ledger;
}

export function withdrawnSets(ledger) {
  return {
    artifacts: new Set(ledger.withdrawals.flatMap((entry) => entry.artifact_id ?? [])),
    datasets: new Set(ledger.withdrawals.flatMap((entry) => entry.dataset_id ?? []))
  };
}
