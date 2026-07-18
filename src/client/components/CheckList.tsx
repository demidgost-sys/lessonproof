import type { CheckResult } from "../types";
import { StatusIcon } from "./StatusIcon";

interface CheckListProps {
  checks: CheckResult[];
  compact?: boolean;
}

export function CheckList({ checks, compact = false }: CheckListProps) {
  return (
    <ul className={`check-list${compact ? " check-list--compact" : ""}`} aria-label="Deterministic checks">
      {checks.map((check) => (
        <li key={check.id} className="check-item">
          <StatusIcon status={check.status} />
          <span>
            <strong>{check.label}</strong>
            {!compact && <small>{check.detail}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
