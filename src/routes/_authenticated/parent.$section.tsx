import { createFileRoute, notFound } from "@tanstack/react-router";
import { ParentPortalDashboard, type ParentSection } from "@/components/parent-portal";
import { Route as ParentRoute } from "@/routes/_authenticated/parent";

const sections: ParentSection[] = ["attendance", "learning", "fees", "timetable", "news", "cctv"];

export const Route = createFileRoute("/_authenticated/parent/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.includes(params.section as ParentSection)) throw notFound();
  },
  component: ParentSectionPage,
});

function ParentSectionPage() {
  const { user } = ParentRoute.useRouteContext();
  const { section } = Route.useParams();
  return <ParentPortalDashboard user={user} view={section as ParentSection} />;
}
