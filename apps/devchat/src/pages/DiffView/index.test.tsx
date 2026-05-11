import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff } from "@devchat/types";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
import { DiffViewPage } from ".";

vi.mock("../../lib/tauri", () => ({
  invokeCommand: vi.fn().mockResolvedValue([]),
  listenCommandEvent: vi.fn().mockResolvedValue(() => {})
}));

const diff: FileDiff = {
  filePath: "src/App.tsx",
  type: "modified",
  hunks: [{ header: "@@ -1 +1 @@", lines: ["-old", "+new"] }],
  additions: 1,
  deletions: 1,
  rawDiff: "",
  selected: true
};

describe("DiffViewPage", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isGenerating: false,
      pendingDiffs: [diff],
      error: undefined,
      lastFailedUserMessageId: undefined
    });
    useProjectStore.setState({
      currentProject: null,
      branches: [],
      error: undefined
    });
  });

  it("keeps file selection in the store and folds diff content", () => {
    render(
      <MemoryRouter>
        <DiffViewPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /src\/App.tsx/i }));
    expect(useChatStore.getState().pendingDiffs[0]?.selected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "折叠文件 diff" }));
    expect(screen.queryByText("+new")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开文件 diff" }));
    expect(screen.getByText((_, element) => element?.tagName.toLowerCase() === "pre" && element.textContent?.includes("+new"))).toBeTruthy();
  });

  it("limits rendered lines for large diffs", () => {
    useChatStore.setState({
      pendingDiffs: [
        {
          ...diff,
          hunks: [{ header: "@@ -1,500 +1,500 @@", lines: Array.from({ length: 500 }, (_, index) => ` line-${index}`) }]
        }
      ]
    });

    render(
      <MemoryRouter>
        <DiffViewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/仅显示前 400 行/)).toBeTruthy();
    expect(screen.queryByText(" line-499")).toBeNull();
  });
});
