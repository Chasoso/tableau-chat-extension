import { describe, expect, it, vi } from "vitest";
import { registerMarkSelectionChangedListeners } from "./markSelectionListener";

type Listener = (event?: unknown) => void;

function createWorksheet(name: string, id: string) {
  let listener: Listener | null = null;
  const addEventListener = vi.fn((_eventType: string, handler: Listener) => {
    listener = handler;
  });
  const removeEventListener = vi.fn((_eventType: string, handler: Listener) => {
    if (listener === handler) {
      listener = null;
    }
  });

  return {
    worksheet: {
      name,
      id,
      addEventListener,
      removeEventListener,
    },
    trigger(event?: unknown) {
      listener?.(event);
    },
  };
}

describe("markSelectionListener", () => {
  it("registers listeners for worksheets and cleans them up", async () => {
    const first = createWorksheet("Sales Trend", "worksheet-1");
    const second = createWorksheet("Regional Performance", "worksheet-2");
    const onSelectionChanged = vi.fn();
    const onError = vi.fn();

    const cleanup = registerMarkSelectionChangedListeners(
      {
        worksheets: [first.worksheet, second.worksheet],
      },
      {
        onSelectionChanged,
        onError,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first.worksheet.addEventListener).toHaveBeenCalledTimes(1);
    expect(second.worksheet.addEventListener).toHaveBeenCalledTimes(1);

    first.trigger({
      worksheetName: "Sales Trend",
      worksheetId: "worksheet-1",
      eventType: "MarkSelectionChanged",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelectionChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        worksheetName: "Sales Trend",
        worksheetId: "worksheet-1",
      }),
    );
    expect(onError).not.toHaveBeenCalled();

    cleanup();

    expect(first.worksheet.removeEventListener).toHaveBeenCalledTimes(1);
    expect(second.worksheet.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("keeps missing worksheets and listener failures safe", async () => {
    const addEventListener = vi.fn(() => {
      throw new Error("listener failed");
    });
    const onSelectionChanged = vi.fn();
    const onError = vi.fn();

    const cleanup = registerMarkSelectionChangedListeners(
      {
        worksheets: [
          {
            name: "Broken Worksheet",
            id: "worksheet-broken",
            addEventListener,
          },
        ],
      },
      {
        onSelectionChanged,
        onError,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(onSelectionChanged).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();

    cleanup();
  });

  it("handles dashboards without worksheets", async () => {
    const onSelectionChanged = vi.fn();
    const cleanup = registerMarkSelectionChangedListeners(
      {},
      {
        onSelectionChanged,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelectionChanged).not.toHaveBeenCalled();

    cleanup();
  });
});
