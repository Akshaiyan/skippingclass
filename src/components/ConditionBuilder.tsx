import { Plus, Trash2 } from "lucide-react";
import type { Condition, Op, Operand } from "@/types";
import { FIELDS, FIELD_MAP, type FieldType } from "@/lib/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPS_BY_TYPE: Record<FieldType, Op[]> = {
  bool: ["eq", "neq", "is_blank", "is_not_blank"],
  number: ["gt", "gte", "lt", "lte", "eq", "neq", "is_blank", "is_not_blank"],
  date: ["before", "after", "eq", "is_blank", "is_not_blank"],
  enum: ["eq", "neq", "in", "not_in", "is_blank", "is_not_blank"],
  text: ["eq", "neq", "is_blank", "is_not_blank"],
};
const OP_LABEL: Record<Op, string> = {
  eq: "equals",
  neq: "does not equal",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "is one of",
  not_in: "is not one of",
  is_blank: "is blank",
  is_not_blank: "is not blank",
  before: "before",
  after: "after",
};

const sel = "h-8 rounded-md border border-border bg-background px-2 text-xs hover:border-border-strong";

type Kind = "leaf" | "all" | "any" | "not";
const kindOf = (c: Condition): Kind => ("all" in c ? "all" : "any" in c ? "any" : "not" in c ? "not" : "leaf");
export const emptyLeaf = (): Condition => ({ field: "", op: "eq" });

function Leaf({ c, onChange }: { c: Extract<Condition, { field: string }>; onChange: (c: Condition) => void }) {
  const meta = FIELD_MAP[c.field];
  const type = meta?.type ?? "text";
  const ops = OPS_BY_TYPE[type];
  const needsRight = c.op !== "is_blank" && c.op !== "is_not_blank";
  const right = c.right;
  const setRight = (r: Operand | undefined) => onChange({ ...c, right: r });
  const sameTypeFields = FIELDS.filter((f) => f.type === type && f.name !== c.field);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Field"
        className={cn(sel, "font-mono")}
        value={c.field}
        onChange={(e) => {
          const f = FIELD_MAP[e.target.value];
          onChange({ field: e.target.value, op: f ? OPS_BY_TYPE[f.type][0] : "eq" });
        }}
      >
        <option value="">Choose field</option>
        {FIELDS.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name} ({f.type})
          </option>
        ))}
      </select>
      <select aria-label="Operator" className={sel} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Op, right: ["is_blank", "is_not_blank"].includes(e.target.value) ? undefined : c.right })}>
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>
      {needsRight && c.field && (
        <>
          {(type === "number" || type === "date") && (
            <select
              aria-label="Compare with"
              className={sel}
              value={right?.kind ?? "value"}
              onChange={(e) => setRight(e.target.value === "field" ? { kind: "field", field: "" } : undefined)}
            >
              <option value="value">a value</option>
              <option value="field">another field</option>
            </select>
          )}
          {right?.kind === "field" ? (
            <>
              <select aria-label="Right field" className={cn(sel, "font-mono")} value={right.field} onChange={(e) => setRight({ ...right, field: e.target.value })}>
                <option value="">Choose field</option>
                {sameTypeFields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              {type === "number" && (
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  × factor
                  <input
                    type="number"
                    step="0.05"
                    className={cn(sel, "w-20 tnum")}
                    value={right.factor ?? 1}
                    onChange={(e) => setRight({ ...right, factor: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </label>
              )}
            </>
          ) : type === "bool" ? (
            <select
              aria-label="Value"
              className={sel}
              value={right?.kind === "value" ? String(right.value) : ""}
              onChange={(e) => setRight(e.target.value === "" ? undefined : { kind: "value", value: e.target.value === "true" })}
            >
              <option value="">Choose</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : type === "enum" && (c.op === "in" || c.op === "not_in") ? (
            <div className="flex flex-wrap gap-1">
              {meta?.options?.map((o) => {
                const arr = right?.kind === "value" && Array.isArray(right.value) ? right.value : [];
                const on = arr.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? arr.filter((x) => x !== o) : [...arr, o];
                      setRight(next.length ? { kind: "value", value: next } : undefined);
                    }}
                    className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", on ? "border-foreground bg-primary text-primary-foreground" : "border-border hover:border-border-strong")}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : type === "enum" ? (
            <select
              aria-label="Value"
              className={cn(sel, "font-mono")}
              value={right?.kind === "value" ? String(right.value) : ""}
              onChange={(e) => setRight(e.target.value ? { kind: "value", value: e.target.value } : undefined)}
            >
              <option value="">Choose</option>
              {meta?.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Value"
              type={type === "number" ? "number" : type === "date" ? "date" : "text"}
              className={cn(sel, "w-32 tnum")}
              value={right?.kind === "value" ? String(right.value) : ""}
              onChange={(e) => setRight(e.target.value === "" ? undefined : { kind: "value", value: type === "number" ? Number(e.target.value) : e.target.value })}
            />
          )}
        </>
      )}
    </div>
  );
}

export function ConditionBuilder({ value, onChange, onRemove, depth = 0 }: { value: Condition; onChange: (c: Condition) => void; onRemove?: () => void; depth?: number }) {
  const kind = kindOf(value);
  const changeKind = (k: Kind) => {
    if (k === kind) return;
    const children = "all" in value ? value.all : "any" in value ? value.any : "not" in value ? [value.not] : [value];
    if (k === "leaf") onChange(children[0] && kindOf(children[0]) === "leaf" ? children[0] : emptyLeaf());
    else if (k === "not") onChange({ not: children[0] ?? emptyLeaf() });
    else onChange(k === "all" ? { all: children } : { any: children });
  };

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", depth % 2 ? "border-border bg-background" : "border-border bg-surface")}>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Condition type" className={sel} value={kind} onChange={(e) => changeKind(e.target.value as Kind)}>
          <option value="leaf">Single check</option>
          <option value="all">All of (and)</option>
          <option value="any">Any of (or)</option>
          <option value="not">Not</option>
        </select>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onRemove}>
            <Trash2 aria-hidden /> Remove
          </Button>
        )}
      </div>
      {kind === "leaf" && <Leaf c={value as Extract<Condition, { field: string }>} onChange={onChange} />}
      {kind === "not" && "not" in value && <ConditionBuilder value={value.not} depth={depth + 1} onChange={(c) => onChange({ not: c })} />}
      {(kind === "all" || kind === "any") && (
        <div className="space-y-2 border-l-2 border-border pl-3">
          {("all" in value ? value.all : "any" in value ? value.any : []).map((child, i, arr) => (
            <ConditionBuilder
              key={i}
              value={child}
              depth={depth + 1}
              onChange={(c) => {
                const next = arr.map((x, j) => (j === i ? c : x));
                onChange(kind === "all" ? { all: next } : { any: next });
              }}
              onRemove={() => {
                const next = arr.filter((_, j) => j !== i);
                onChange(kind === "all" ? { all: next } : { any: next });
              }}
            />
          ))}
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const arr = "all" in value ? value.all : "any" in value ? value.any : [];
                const next = [...arr, emptyLeaf()];
                onChange(kind === "all" ? { all: next } : { any: next });
              }}
            >
              <Plus aria-hidden /> Add check
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const arr = "all" in value ? value.all : "any" in value ? value.any : [];
                const next = [...arr, { any: [emptyLeaf()] } as Condition];
                onChange(kind === "all" ? { all: next } : { any: next });
              }}
            >
              <Plus aria-hidden /> Add group
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
