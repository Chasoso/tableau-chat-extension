type WorksheetSelectionEventHandler = (event?: unknown) => void;

type WorksheetLike = {
  name?: string;
  id?: string;
  addEventListener?: (
    eventType: string,
    handler: WorksheetSelectionEventHandler,
  ) => unknown;
  removeEventListener?: (
    eventType: string,
    handler: WorksheetSelectionEventHandler,
  ) => unknown;
};

type TableauDashboardLike = {
  worksheets?: unknown[];
  getWorksheetsAsync?: () => Promise<unknown[]>;
};

export type MarkSelectionChangedListenerContext = {
  worksheetName?: string;
  worksheetId?: string;
  changedAt: string;
  eventType: string;
};

export type MarkSelectionChangedListenerOptions = {
  onSelectionChanged: (
    context: MarkSelectionChangedListenerContext,
  ) => void | Promise<void>;
  onError?: (
    error: unknown,
    context: Partial<MarkSelectionChangedListenerContext>,
  ) => void;
};

const MARK_SELECTION_CHANGED_EVENT_CANDIDATES = [
  "MarkSelectionChanged",
  "mark-selection-changed",
];

export function registerMarkSelectionChangedListeners(
  dashboard: unknown,
  options: MarkSelectionChangedListenerOptions,
): () => void {
  let cancelled = false;
  const removers: Array<() => void> = [];

  void resolveWorksheets(dashboard)
    .then((worksheets) => {
      if (cancelled) {
        return;
      }

      worksheets.forEach((worksheet, index) => {
        const listener = (event?: unknown) => {
          const context = createListenerContext(worksheet, event);
          void Promise.resolve(options.onSelectionChanged(context)).catch(
            (error) => {
              options.onError?.(error, context);
            },
          );
        };

        const eventType = resolveEventType(dashboard, worksheet);
        const cleanup = attachListener(worksheet, eventType, listener);
        if (cleanup) {
          removers.push(cleanup);
          return;
        }

        options.onError?.(
          new Error("Failed to register MarkSelectionChanged listener."),
          {
            worksheetName: worksheet.name ?? undefined,
            worksheetId: worksheet.id ?? undefined,
            eventType,
          },
        );
        if (index === 0 && worksheets.length === 1) {
          return;
        }
      });
    })
    .catch((error) => {
      options.onError?.(error, {});
    });

  return () => {
    cancelled = true;
    while (removers.length > 0) {
      const remove = removers.pop();
      try {
        remove?.();
      } catch {
        // Keep cleanup best-effort.
      }
    }
  };
}

async function resolveWorksheets(dashboard: unknown): Promise<WorksheetLike[]> {
  if (!dashboard || typeof dashboard !== "object") {
    return [];
  }

  const dashboardObject = dashboard as TableauDashboardLike;
  if (Array.isArray(dashboardObject.worksheets)) {
    return dashboardObject.worksheets.flatMap((worksheet) =>
      isWorksheetLike(worksheet) ? [worksheet] : [],
    );
  }

  if (dashboardObject.getWorksheetsAsync) {
    try {
      const worksheets = await dashboardObject.getWorksheetsAsync();
      return Array.isArray(worksheets)
        ? worksheets.flatMap((worksheet) =>
            isWorksheetLike(worksheet) ? [worksheet] : [],
          )
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function attachListener(
  worksheet: WorksheetLike,
  eventType: string,
  listener: WorksheetSelectionEventHandler,
): (() => void) | null {
  try {
    const registrationResult = worksheet.addEventListener?.(
      eventType,
      listener,
    );

    if (typeof registrationResult === "function") {
      return () => {
        try {
          registrationResult();
        } catch {
          // Ignore cleanup errors.
        }
      };
    }

    if (typeof worksheet.removeEventListener === "function") {
      return () => {
        try {
          worksheet.removeEventListener?.(eventType, listener);
        } catch {
          // Ignore cleanup errors.
        }
      };
    }
  } catch {
    return null;
  }

  return null;
}

function createListenerContext(
  worksheet: WorksheetLike,
  event: unknown,
): MarkSelectionChangedListenerContext {
  const eventObject = event as {
    worksheetName?: string;
    worksheetId?: string;
    worksheet?: { name?: string; id?: string };
    changedAt?: string;
  };

  return {
    worksheetName:
      eventObject?.worksheetName ??
      eventObject?.worksheet?.name ??
      worksheet.name,
    worksheetId:
      eventObject?.worksheetId ?? eventObject?.worksheet?.id ?? worksheet.id,
    changedAt: new Date().toISOString(),
    eventType: resolveEventTypeFromEvent(event),
  };
}

function resolveEventType(
  dashboard: unknown,
  worksheet?: WorksheetLike,
): string {
  const candidates = [
    readEventTypeFromValue(dashboard),
    readEventTypeFromValue(worksheet),
    ...MARK_SELECTION_CHANGED_EVENT_CANDIDATES,
  ];

  return (
    candidates.find((candidate) => Boolean(candidate)) ?? "MarkSelectionChanged"
  );
}

function resolveEventTypeFromEvent(event: unknown): string {
  const eventObject = event as { eventType?: string; type?: string };
  return eventObject?.eventType ?? eventObject?.type ?? "MarkSelectionChanged";
}

function readEventTypeFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidate =
    readNestedString(record, "TableauEventType", "MarkSelectionChanged") ??
    readNestedString(record, "tableauEventType", "MarkSelectionChanged") ??
    readNestedString(record, "TableauEventType", "MARK_SELECTION_CHANGED");

  return candidate;
}

function readNestedString(
  value: Record<string, unknown>,
  parentKey: string,
  childKey: string,
): string | null {
  const parent = value[parentKey];
  if (!parent || typeof parent !== "object") {
    return null;
  }

  const child = (parent as Record<string, unknown>)[childKey];
  return typeof child === "string" ? child : null;
}

function isWorksheetLike(value: unknown): value is WorksheetLike {
  return Boolean(value) && typeof value === "object";
}
