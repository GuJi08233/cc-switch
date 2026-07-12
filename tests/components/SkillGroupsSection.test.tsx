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

const renderSkill = (skill: InstalledSkill) => (
  <div data-testid={`skill-${skill.id}`}>{skill.name}</div>
);

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
        renderSkill={renderSkill}
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

  it("hides grouped skills at the root and reveals them when the group expands", async () => {
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[
          makeSkill("a", "Alpha", true),
          makeSkill("b", "Beta", false),
          makeSkill("c", "Gamma", false),
        ]}
        renderSkill={renderSkill}
      />,
    );

    expect(screen.queryByTestId("skill-a")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skill-b")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-c")).toBeInTheDocument();

    const expandButton = screen.getByRole("button", {
      name: "skills.groups.expandGroup",
    });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    await user.click(expandButton);

    expect(screen.getByTestId("skill-a")).toBeInTheDocument();
    expect(screen.getByTestId("skill-b")).toBeInTheDocument();
    expect(screen.getByTestId("skill-c")).toBeInTheDocument();
    expect(expandButton).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a shared skill in every expanded group without a root duplicate", async () => {
    groups = [
      { id: "group-1", name: "Frontend", skillIds: ["a"] },
      { id: "group-2", name: "Testing", skillIds: ["a"] },
    ];
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true)]}
        renderSkill={renderSkill}
      />,
    );

    expect(screen.queryByTestId("skill-a")).not.toBeInTheDocument();
    const expandButtons = screen.getAllByRole("button", {
      name: "skills.groups.expandGroup",
    });
    await user.click(expandButtons[0]);
    await user.click(expandButtons[1]);
    expect(screen.getAllByTestId("skill-a")).toHaveLength(2);
  });

  it("treats stale member ids as an empty group and keeps valid skills ungrouped", () => {
    groups = [{ id: "group-1", name: "Broken", skillIds: ["missing"] }];
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true)]}
        renderSkill={renderSkill}
      />,
    );

    expect(screen.getByTestId("skill-a")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Broken" });
    expect(
      within(group).getAllByRole("button", {
        name: "skills.groups.appState",
      })[0],
    ).toBeDisabled();
  });

  it("allows selecting installed skills as reusable group members", async () => {
    groups = [{ id: "group-1", name: "Frontend", skillIds: ["a"] }];
    const user = userEvent.setup();
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true), makeSkill("b", "Beta", false)]}
        renderSkill={renderSkill}
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
        renderSkill={renderSkill}
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
    render(
      <SkillGroupsSection
        skills={[makeSkill("a", "Alpha", true)]}
        renderSkill={renderSkill}
      />,
    );

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
