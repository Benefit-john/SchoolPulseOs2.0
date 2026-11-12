import { createFileRoute, redirect } from "@tanstack/react-router";
import { RolePortalSettings } from "@/components/role-portal-settings";
import { Route as PortalRoute } from "@/routes/_authenticated/portal.$role";
import type { AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/portal/$role/settings")({
  beforeLoad: ({ params }) => {
    if (params.role === "admin") throw redirect({ to: "/profile" });
  },
  component: PortalSettingsPage,
});

function PortalSettingsPage() {
  const { role } = PortalRoute.useParams();
  const { user } = PortalRoute.useRouteContext();
  return <RolePortalSettings role={role as AppRole} user={user} />;
}
