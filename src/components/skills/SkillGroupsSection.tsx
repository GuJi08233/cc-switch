import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, Loader2, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { APP_ICON_MAP, SKILLS_APP_IDS } from "@/config/appConfig";
import {
  type InstalledSkill,
  type SkillGroup,
  useCreateSkillGroup,
  useDeleteSkillGroup,
  useSetSkillGroupMembers,
  useSkillGroups,
  useToggleSkillGroupApp,
  useUpdateSkillGroup,
} from "@/hooks/useSkills";
import type { AppId } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface SkillGroupsSectionProps {
  skills: InstalledSkill[];
}

type GroupAppState = "enabled" | "disabled" | "mixed";

function getGroupAppState(
  group: SkillGroup,
  skillsById: Map<string, InstalledSkill>,
  app: AppId,
): GroupAppState {
  const members = group.skillIds
    .map((id) => skillsById.get(id))
    .filter((skill): skill is InstalledSkill => Boolean(skill));
  if (members.length === 0) return "disabled";
  const enabledCount = members.filter((skill) => skill.apps[app]).length;
  if (enabledCount === 0) return "disabled";
  if (enabledCount === members.length) return "enabled";
  return "mixed";
}

export function SkillGroupsSection({ skills }: SkillGroupsSectionProps) {
  const { t } = useTranslation();
  const { data: groups = [], isLoading } = useSkillGroups();
  const createMutation = useCreateSkillGroup();
  const updateMutation = useUpdateSkillGroup();
  const deleteMutation = useDeleteSkillGroup();
  const membersMutation = useSetSkillGroupMembers();
  const toggleAppMutation = useToggleSkillGroupApp();

  const [newName, setNewName] = useState("");
  const [editingGroup, setEditingGroup] = useState<SkillGroup | null>(null);
  const [editingName, setEditingName] = useState("");
  const [membersGroup, setMembersGroup] = useState<SkillGroup | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );
  const [deletingGroup, setDeletingGroup] = useState<SkillGroup | null>(null);

  const skillsById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills],
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createMutation.mutateAsync(name);
      setNewName("");
      toast.success(t("skills.groups.createSuccess", { name }));
    } catch (error) {
      toast.error(t("skills.groups.createFailed"), {
        description: String(error),
      });
    }
  };

  const openRename = (group: SkillGroup) => {
    setEditingGroup(group);
    setEditingName(group.name);
  };

  const handleRename = async () => {
    if (!editingGroup) return;
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateMutation.mutateAsync({ id: editingGroup.id, name });
      setEditingGroup(null);
      toast.success(t("skills.groups.renameSuccess", { name }));
    } catch (error) {
      toast.error(t("skills.groups.renameFailed"), {
        description: String(error),
      });
    }
  };

  const openMembers = (group: SkillGroup) => {
    setMembersGroup(group);
    setSelectedSkillIds(
      new Set(group.skillIds.filter((id) => skillsById.has(id))),
    );
  };

  const handleSaveMembers = async () => {
    if (!membersGroup) return;
    try {
      await membersMutation.mutateAsync({
        id: membersGroup.id,
        skillIds: Array.from(selectedSkillIds),
      });
      setMembersGroup(null);
      toast.success(t("skills.groups.membersSaved"));
    } catch (error) {
      toast.error(t("skills.groups.membersSaveFailed"), {
        description: String(error),
      });
    }
  };

  const handleToggleApp = async (
    group: SkillGroup,
    app: AppId,
    state: GroupAppState,
  ) => {
    const enabled = state !== "enabled";
    try {
      const result = await toggleAppMutation.mutateAsync({
        id: group.id,
        app,
        enabled,
      });
      if (result.failed.length > 0) {
        const details = result.failed
          .slice(0, 3)
          .map(
            ({ skillId, error }) =>
              `${skillsById.get(skillId)?.name ?? skillId}: ${error}`,
          )
          .join("; ");
        toast.error(t("skills.groups.togglePartialFailed"), {
          description: t("skills.groups.togglePartialFailedDescription", {
            succeeded: result.succeeded.length,
            failed: result.failed.length,
            details,
          }),
          duration: 8000,
        });
        return;
      }
      toast.success(
        t(
          enabled
            ? "skills.groups.enabledForApp"
            : "skills.groups.disabledForApp",
          {
            name: group.name,
            app: APP_ICON_MAP[app].label,
          },
        ),
      );
    } catch (error) {
      toast.error(t("skills.groups.toggleFailed"), {
        description: String(error),
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;
    try {
      await deleteMutation.mutateAsync(deletingGroup.id);
      toast.success(
        t("skills.groups.deleteSuccess", { name: deletingGroup.name }),
      );
      setDeletingGroup(null);
    } catch (error) {
      toast.error(t("skills.groups.deleteFailed"), {
        description: String(error),
      });
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-border-default bg-card/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("skills.groups.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("skills.groups.description")}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !createMutation.isPending) {
                void handleCreate();
              }
            }}
            maxLength={100}
            placeholder={t("skills.groups.namePlaceholder")}
            className="sm:w-48"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={!newName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="mr-1.5 h-4 w-4" />
            )}
            {t("skills.groups.create")}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="py-3 text-center text-xs text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-default px-3 py-4 text-center text-xs text-muted-foreground">
            {t("skills.groups.empty")}
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border-default bg-background/70 px-3 py-2.5"
            >
              <div className="min-w-32 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {group.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("skills.groups.memberCount", {
                    count: group.skillIds.filter((id) => skillsById.has(id))
                      .length,
                  })}
                </div>
              </div>

              <div
                className="flex items-center gap-1.5"
                aria-label={t("skills.groups.batchApps")}
              >
                {SKILLS_APP_IDS.map((app) => {
                  const state = getGroupAppState(group, skillsById, app);
                  const config = APP_ICON_MAP[app];
                  return (
                    <button
                      key={app}
                      type="button"
                      onClick={() => void handleToggleApp(group, app, state)}
                      disabled={
                        group.skillIds.length === 0 ||
                        toggleAppMutation.isPending
                      }
                      className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                        state === "enabled"
                          ? config.activeClass
                          : state === "mixed"
                            ? "border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "border-transparent opacity-35 hover:opacity-70"
                      }`}
                      aria-label={t("skills.groups.appState", {
                        app: config.label,
                        state: t(`skills.groups.states.${state}`),
                      })}
                      title={t("skills.groups.appState", {
                        app: config.label,
                        state: t(`skills.groups.states.${state}`),
                      })}
                    >
                      {config.icon}
                      {state === "mixed" && (
                        <span className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded bg-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openMembers(group)}
                  title={t("skills.groups.manageMembers")}
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openRename(group)}
                  title={t("skills.groups.rename")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  onClick={() => setDeletingGroup(group)}
                  title={t("skills.groups.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={Boolean(editingGroup)}
        onOpenChange={(open) => !open && setEditingGroup(null)}
      >
        <DialogContent className="max-w-sm" zIndex="alert">
          <DialogHeader>
            <DialogTitle>{t("skills.groups.renameTitle")}</DialogTitle>
            <DialogDescription>
              {t("skills.groups.renameDescription")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !updateMutation.isPending) {
                void handleRename();
              }
            }}
            maxLength={100}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={!editingName.trim() || updateMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(membersGroup)}
        onOpenChange={(open) => !open && setMembersGroup(null)}
      >
        <DialogContent
          className="max-w-lg max-h-[80vh] flex flex-col"
          zIndex="alert"
        >
          <DialogHeader>
            <DialogTitle>
              {t("skills.groups.membersTitle", { name: membersGroup?.name })}
            </DialogTitle>
            <DialogDescription>
              {t("skills.groups.membersDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-2">
            {skills.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("skills.groups.noInstalledSkills")}
              </div>
            ) : (
              skills.map((skill) => (
                <label
                  key={skill.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-default p-3 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedSkillIds.has(skill.id)}
                    onCheckedChange={(checked) => {
                      setSelectedSkillIds((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(skill.id);
                        else next.delete(skill.id);
                        return next;
                      });
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {skill.name}
                    </span>
                    {skill.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {skill.description}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMembersGroup(null)}
              disabled={membersMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleSaveMembers()}
              disabled={membersMutation.isPending}
            >
              {t("skills.groups.saveMembers", { count: selectedSkillIds.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deletingGroup && (
        <ConfirmDialog
          isOpen={true}
          title={t("skills.groups.deleteTitle")}
          message={t("skills.groups.deleteConfirm", {
            name: deletingGroup.name,
          })}
          confirmText={t("skills.groups.delete")}
          variant="destructive"
          zIndex="top"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeletingGroup(null)}
        />
      )}
    </section>
  );
}
