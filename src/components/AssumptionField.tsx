import { useEffect, useState } from "react";
import { useStore } from "@/store";
import type { SavingsAssumptions } from "@/lib/savings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** One editable input of the cost view. The section it sits in carries the ASSUMED tag. Shares are typed as percent. */
export function AssumptionField({
  name,
  label,
  unit,
  percent,
}: {
  name: keyof SavingsAssumptions;
  label: string;
  unit: string;
  percent?: boolean;
}) {
  const { state, dispatch } = useStore();
  const stored = state.assumptions[name];
  const shown = percent ? Math.round(stored * 10000) / 100 : stored;
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);
  const id = `assumption-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="tnum"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(",", "."));
            if (e.target.value.trim() !== "" && Number.isFinite(n))
              dispatch({ type: "setAssumption", key: name, value: percent ? n / 100 : n });
          }}
        />
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
