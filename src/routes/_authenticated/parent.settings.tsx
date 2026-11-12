import { createFileRoute } from "@tanstack/react-router";
import { ParentSettings } from "@/components/parent-portal";
import { Route as ParentRoute } from "@/routes/_authenticated/parent";

export const Route = createFileRoute("/_authenticated/parent/settings")({
  component: ParentSettingsPage,
});

function ParentSettingsPage() {
  const { user } = ParentRoute.useRouteContext();
  return <ParentSettings user={user} />;
}
