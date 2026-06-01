import type { SupabaseClient } from "@supabase/supabase-js";

export type RouteUser = {
  id: string;
  email: string | null;
  isAnonymous?: boolean;
};

export type ProjectCollaboratorRole = "owner" | "producer" | "client" | "reviewer";
export type ProjectCollaboratorStatus = "pending" | "active" | "removed";

export type ProjectAccess = {
  projectId: string;
  role: ProjectCollaboratorRole;
  status: ProjectCollaboratorStatus | "owner";
  canManage: boolean;
  canReview: boolean;
  canGenerate: boolean;
  canEditProject: boolean;
  isOwner: boolean;
};

export const COLLABORATOR_ROLES: ProjectCollaboratorRole[] = [
  "owner",
  "producer",
  "client",
  "reviewer",
];

export const COLLABORATOR_ROLE_LABELS: Record<ProjectCollaboratorRole, string> = {
  owner: "Owner",
  producer: "Producer",
  client: "Client",
  reviewer: "Reviewer",
};

export function normalizeCollaboratorRole(value: unknown): ProjectCollaboratorRole {
  return COLLABORATOR_ROLES.includes(value as ProjectCollaboratorRole)
    ? (value as ProjectCollaboratorRole)
    : "reviewer";
}

function accessForRole(
  projectId: string,
  role: ProjectCollaboratorRole,
  status: ProjectCollaboratorStatus | "owner",
  isOwner = false
): ProjectAccess {
  const canManage = role === "owner" || role === "producer";
  const canReview = canManage || role === "client" || role === "reviewer";
  return {
    projectId,
    role,
    status,
    canManage,
    canReview,
    canGenerate: canManage,
    canEditProject: canManage,
    isOwner,
  };
}

export async function getProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  user: RouteUser | null
): Promise<ProjectAccess | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (!project) return null;

  if (user?.id && !user.isAnonymous && project.user_id === user.id) {
    return accessForRole(projectId, "owner", "owner", true);
  }

  if (user?.email || (user?.id && !user.isAnonymous)) {
    let collaborator = null;

    if (user.email) {
      const { data } = await supabase
        .from("project_collaborators")
        .select("role, status")
        .eq("project_id", projectId)
        .eq("email", user.email)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      collaborator = data;
    }

    if (!collaborator && user.id && !user.isAnonymous) {
      const { data } = await supabase
        .from("project_collaborators")
        .select("role, status")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      collaborator = data;
    }

    if (collaborator && collaborator.status !== "removed") {
      return accessForRole(
        projectId,
        normalizeCollaboratorRole(collaborator.role),
        collaborator.status as ProjectCollaboratorStatus
      );
    }
  }

  // Backward-compatible internal mode while full auth enforcement is rolled in.
  // Existing live preview links keep working, but real signed-in users above get
  // proper owner/collaborator permissions.
  if (user?.isAnonymous) {
    return accessForRole(projectId, "owner", "owner", true);
  }

  return null;
}

export function requireProjectAccess(access: ProjectAccess | null) {
  if (!access) {
    return { error: "Project not found or access denied", status: 404 };
  }
  return null;
}
