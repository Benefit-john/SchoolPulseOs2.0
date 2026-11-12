import { createFileRoute } from "@tanstack/react-router";
import { requireRoles } from "@/lib/route-guards";
import { Bus, MapPin, Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/bus-tracking")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "driver"]),
  component: BusTrackingPage,
});
function BusTrackingPage() {
  return (
    <AppShell title="Bus Tracking" subtitle="Live route telemetry for this school workspace">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className="hairline-card relative min-h-[420px] overflow-hidden bg-[#e7eef0] p-5">
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(#c6d6d8 1px, transparent 1px), linear-gradient(90deg, #c6d6d8 1px, transparent 1px)",
              backgroundSize: "42px 42px",
            }}
          />
          <div className="relative z-10 flex h-full min-h-[380px] items-center justify-center text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-primary shadow-sm">
                <Bus className="size-7" />
              </span>
              <h2 className="mt-5 text-xl font-bold">Connect your route provider</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Live bus locations will appear here after a GPS provider and school routes are
                configured. No route positions are being fabricated.
              </p>
              <p className="mt-5 text-xs font-medium text-muted-foreground">
                A school administrator must configure a supported GPS provider before live tracking
                can be enabled.
              </p>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <article className="hairline-card p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Radio className="size-5" />
              </span>
              <div>
                <h2 className="display-title text-base">Telemetry status</h2>
                <p className="mt-1 text-xs text-muted-foreground">No provider connected</p>
              </div>
              <Badge variant="outline" className="ml-auto">
                Setup required
              </Badge>
            </div>
            <div className="mt-5 space-y-3 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <MapPin className="size-4" /> Routes are scoped per school.
              </p>
              <p className="flex items-center gap-2">
                <Bus className="size-4" /> Driver and vehicle records will be synced here.
              </p>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
