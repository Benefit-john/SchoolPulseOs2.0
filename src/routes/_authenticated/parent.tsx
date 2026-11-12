import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ParentPortalLayout, ParentPortalDashboard } from "@/components/parent-portal";
import { supabase } from "@/integrations/supabase/client";
import { roleHome, type AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/parent")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/sign-in" });

    const { data: rows, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (rolesError) throw rolesError;

    const roles = (rows ?? []).map((row) => row.role as AppRole);
    if (!roles.includes("parent")) {
      if (roles[0]) throw redirect(roleHome(roles[0]));
      throw redirect({ to: "/welcome" });
    }

    return { user: data.user };
  },
  component: ParentPortalRoute,
});

function ParentPortalRoute() {
  const { user } = Route.useRouteContext();
  const { pathname } = useLocation();

  return (
    <ParentPortalLayout user={user}>
      {pathname === "/parent" ? <ParentPortalDashboard user={user} /> : <Outlet />}
    </ParentPortalLayout>
  );
}
