import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillGroupsSection } from "@/components/skills/SkillGroupsSection";
import type { InstalledSkill, SkillGroup } from "@/lib/api/skills";

const createGroupMock = vi.fn();
const updateGroupMock = vi.fn();
const deleteGroupMock = vi.fn();
const setMembersMock = vi.fn();
const toggleGroupAppMock = vi.fn();

let groups: SkillGroup[] = [];

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/useSkills", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useSkills")>(
      "@/hooks/useSkills",
    );
  return {
    ...actual,
    useSkillGroups: () => ({ data: groups, isLoading: false }),
    useCreateSkillGroup: () => ({
      mutateAsync: createGroupMock,
      isPending: false,
    }),
    useUpdateSkillGroup: () => ({
      mutateAsync: updateGroupMock,
      isPending: false,
    }),
    useDeleteSkillGroup: () => ({
      mutateAsync: deleteGroupMock,
      isPending: false,
    }),
    useSetSkillGroupMembers: () => ({
      mutateAsync: setMembersMock,
      isPending: false,
    }),
    useToggleSkillGroupApp: () => ({
      mutateAsync: toggleGroupAppMock,
      isPending: false,
    }),
  };
});

const makeSkill = (
  id: string,
  name: string,
  claude: boolean,
): InstalledSkill => ({
  id,
  name,
  directory: id,
  apps: {
    claude,
    codex: false,
    gemini: false,
    opencode: false,
    openclaw: false,
    hermes: false,
  },
  installedAt: 1,
  updatedAt: 1,
});

describe("SkillGroupsSection", () => {
  beforeEach(() => {
    groups = [{ id: "group-1", name: "Frontend", skillIds: ["a", "b"] }];
    createGroupMock.mockReset().mockResolvedValue({});
    updateGroupMock.mockReset().mockResolvedValue({});
    deleteGroupMock.mockReset().mockResolvedValue(true);
    setMembersMock.mockReset().mockResolvedValue({});
    toggleGroupAppMock.mockReset().mockResolvedValue({
      groupId: "group-1",
      app: "claude",
      enabled: true,
      succeeded: ["a", "b"],
      failed: [],
    });
  });

  it("shows member count and a clear mixed app state, then enables the whole group", async () => {
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true), makeSkill("b", "Beta", false)]}
      />,
    );

    expect(screen.getByText("skills.groups.memberCount")).toBeInTheDocument();
    const mixedButton = screen.getAllByRole("button", {
      name: "skills.groups.appState",
    })[0];
    await user.click(mixedButton);

    expect(toggleGroupAppMock).toHaveBeenCalledWith({
      id: "group-1",
      app: "claude",
      enabled: true,
    });
  });

  it("allows selecting installed skills as reusable group members", async () => {
    groups = [{ id: "group-1", name: "Frontend", skillIds: ["a"] }];
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true), makeSkill("b", "Beta", false)]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "skills.groups.manageMembers" }),
    );
    const dialog = screen.getByRole("dialog");
    const beta = within(dialog).getByText("Beta").closest("label");
    expect(beta).not.toBeNull();
    await user.click(within(beta!).getByRole("checkbox"));
    await user.click(
      within(dialog).getByRole("button", { name: "skills.groups.saveMembers" }),
    );

    expect(setMembersMock).toHaveBeenCalledWith({
      id: "group-1",
      skillIds: ["a", "b"],
    });
  });

  it("reports partial bulk-toggle failures without discarding successful changes", async () => {
    const { toast } = await import("sonner");
    toggleGroupAppMock.mockResolvedValue({
      groupId: "group-1",
      app: "claude",
      enabled: true,
      succeeded: ["a"],
      failed: [{ skillId: "b", error: "permission denied" }],
    });
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true), makeSkill("b", "Beta", false)]}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "skills.groups.appState" })[0],
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "skills.groups.togglePartialFailed",
        expect.objectContaining({
          description: "skills.groups.togglePartialFailedDescription",
        }),
      );
    });
  });

  it("confirms deletion and makes clear that skills are not uninstalled", async () => {
    const user = userEvent.setup();
    render(<SkillGroupsSection skills={[makeSkill("a", "Alpha", true)]} />);

    await user.click(
      screen.getByRole("button", { name: "skills.groups.delete" }),
    );
    expect(screen.getByText("skills.groups.deleteConfirm")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "skills.groups.delete",
      }),
    );

    await waitFor(() => {
      expect(deleteGroupMock).toHaveBeenCalledWith("group-1");
    });
  });
});
