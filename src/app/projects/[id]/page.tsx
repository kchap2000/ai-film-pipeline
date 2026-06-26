import ProjectOverview from "@/components/ProjectOverview";

// The project landing is now the beautiful, branded presentation (the "bible" view).
// The full production dashboard lives at /projects/[id]/workspace.
export default function ProjectLandingPage({ params }: { params: { id: string } }) {
  return <ProjectOverview projectId={params.id} />;
}
