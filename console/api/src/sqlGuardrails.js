import { isReadOnlySql } from "./runner.js";

export const DESTRUCTIVE_SQL_CONFIRMATION = "RUN DESTRUCTIVE SQL";

export function sqlSafetyDecision(query, body = {}) {
  const readOnly = isReadOnlySql(query);
  const confirmed = body.allowDestructive === true && String(body.confirmation || "") === DESTRUCTIVE_SQL_CONFIRMATION;
  return {
    readOnly,
    destructive: !readOnly,
    allowDestructive: !readOnly && confirmed,
    needsConfirmation: !readOnly && !confirmed
  };
}
