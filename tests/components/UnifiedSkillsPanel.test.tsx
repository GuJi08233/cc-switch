import { createRef } from "react";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import UnifiedSkillsPanel, {
  type UnifiedSkillsPanelHandle,
} from "@/components/skills/UnifiedSkillsPanel";
import type { InstalledSkill, SkillGroup } from "@/lib/api/skills";

const scanUnmanagedMock = vi.fn();
const toggleSkillAppMock = vi.fn();
const uninstallSkillMock = vi.fn();
const importSkillsMock = vi.fn();
const installFromZipMock = vi.fn();
const deleteSkillBackupMock = vi.fn();
const restoreSkillBackupMock = vi.fn();

let installedSkills: InstalledSkill[] = [];
let skillGroups: SkillGroup[] = [];

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useSkills", () => ({
  useSkillGroups: () => ({ data: skillGroups, isLoading: false }),
  useCreateSkillGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSkillGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSkillGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetSkillGroupMembers: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleSkillGroupApp: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInstalledSkills: () => ({
    data: installedSkills,
    isLoading: false,
  }),
  useSkillBackups: () => ({
    data: [],
    refetch: vi.fn(),
    isFetching: false,
  }),
  useDeleteSkillBackup: () => ({
    mutateAsync: deleteSkillBackupMock,
    isPending: false,
  }),
  useToggleSkillApp: () => ({
    mutateAsync: toggleSkillAppMock,
  }),
  useRestoreSkillBackup: () => ({
    mutateAsync: restoreSkillBackupMock,
    isPending: false,
  }),
  useUninstallSkill: () => ({
    mutateAsync: uninstallSkillMock,
  }),
  useScanUnmanagedSkills: () => ({
    data: [
      {
        directory: "shared-skill",
        name: "Shared Skill",
        description: "Imported from Claude",
        foundIn: ["claude"],
        path: "/tmp/shared-skill",
      },
    ],
    refetch: scanUnmanagedMock,
  }),
  useImportSkillsFromApps: () => ({
    mutateAsync: importSkillsMock,
  }),
  useInstallSkillsFromZip: () => ({
    mutateAsync: installFromZipMock,
  }),
  useCheckSkillUpdates: () => ({
    data: [],
    refetch: vi.fn(),
    isFetching: false,
  }),
  useUpdateSkill: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("UnifiedSkillsPanel", () => {
  beforeEach(() => {
    installedSkills = [];
    skillGroups = [];
    scanUnmanagedMock.mockResolvedValue({
      data: [
        {
          directory: "shared-skill",
          name: "Shared Skill",
          description: "Imported from Claude",
          foundIn: ["claude"],
          path: "/tmp/shared-skill",
        },
      ],
    });
    toggleSkillAppMock.mockReset();
    uninstallSkillMock.mockReset().mockResolvedValue({ backupPath: null });
    importSkillsMock.mockReset();
    installFromZipMock.mockReset();
    deleteSkillBackupMock.mockReset();
    restoreSkillBackupMock.mockReset();
  });

  it("integrates grouped skills into the list and preserves single-skill actions", async () => {
    installedSkills = [
      {
        id: "a",
        name: "Alpha",
        directory: "alpha",
        apps: {
          claude: false,
          codex: false,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        installedAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        name: "Beta",
        directory: "beta",
        apps: {
          claude: false,
          codex: false,
          gemini: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
        installedAt: 1,
        updatedAt: 1,
      },
    ];
    skillGroups = [{ id: "group-1", name: "Frontend", skillIds: ["a"] }];
    const user = userEvent.setup();

    render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} currentApp="claude" />,
    );

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "skills.groups.expandGroup" }),
    );

    const alphaRow = screen
      .getByText("Alpha")
      .closest<HTMLDivElement>(".group");
    expect(alphaRow).not.toBeNull();
    await user.click(within(alphaRow!).getByRole("button", { name: "Claude" }));
    expect(toggleSkillAppMock).toHaveBeenCalledWith({
      id: "a",
      app: "claude",
      enabled: true,
    });

    await user.click(
      within(alphaRow!).getByRole("button", { name: "skills.uninstall" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "common.confirm",
      }),
    );
    await waitFor(() => {
      expect(uninstallSkillMock).toHaveBeenCalledWith({
        id: "a",
        skillKey: "alpha::",
      });
    });
  });

  it("opens the import dialog without crashing when app toggles render", async () => {
    const ref = createRef<UnifiedSkillsPanelHandle>();

    render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        currentApp="claude"
      />,
    );

    await act(async () => {
      await ref.current?.openImport();
    });

    await waitFor(() => {
      expect(screen.getByText("skills.import")).toBeInTheDocument();
      expect(screen.getByText("Shared Skill")).toBeInTheDocument();
      expect(screen.getByText("/tmp/shared-skill")).toBeInTheDocument();
    });
  });
});
