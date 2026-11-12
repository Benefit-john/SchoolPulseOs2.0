import { ArrowDownRight, ArrowUpRight, type LucideIcon, Minus } from "lucide-react";
import { CountUp } from "@/components/count-up";

export function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  hero = false,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  hero?: boolean;
  hint?: string;
}) {
  const direction = delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const DeltaIcon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const deltaTone =
    direction === "up"
      ? "text-success"
      : direction === "down"
        ? "text-danger"
        : "text-muted-foreground";
  const valueParts = value.match(/^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)([^\d]*)$/);
  const numericText = valueParts?.[2];
  const numericValue = numericText ? Number(numericText.replace(/,/g, "")) : null;
  const decimalPlaces = numericText?.split(".")[1]?.length ?? 0;

  return (
    <div
      className={`hairline-card clay-card dashboard-depth clay-rise p-4 ${hero ? "kpi-hero" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={`grid size-8 place-items-center rounded-lg ${
            hero ? "bg-gold/15 text-gold" : "bg-primary/8 text-primary"
          }`}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      </div>
      <p className="numeric mt-3 text-[26px] font-semibold leading-none tracking-tight">
        {numericValue !== null && Number.isFinite(numericValue) ? (
          <CountUp
            to={numericValue}
            prefix={valueParts?.[1] ?? ""}
            suffix={valueParts?.[3] ?? ""}
            decimals={decimalPlaces}
          />
        ) : (
          value
        )}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {delta !== undefined ? (
          <span className={`numeric flex items-center gap-0.5 font-medium ${deltaTone}`}>
            <DeltaIcon className="size-3.5" strokeWidth={2} />
            {Math.abs(delta)}%
          </span>
        ) : null}
        <span className="text-muted-foreground">{hint ?? "vs yesterday"}</span>
      </div>
    </div>
  );
}
