import ProjectBrainPanel from "@/components/ProjectBrainPanel";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <>
      {children}
      <ProjectBrainPanel projectId={params.id} />
    </>
  );
}
