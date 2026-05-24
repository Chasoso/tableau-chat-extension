import type { DashboardContext } from "../types/tableau";

type Props = {
  dashboardContext: DashboardContext;
};

export default function DashboardContextPanel({ dashboardContext }: Props) {
  return (
    <aside className="context-card" aria-label="Dashboard context summary">
      <div className="context-row">
        <span>Dashboard</span>
        <strong>{dashboardContext.dashboardName}</strong>
      </div>
      <div className="context-row">
        <span>Workbook</span>
        <strong>{dashboardContext.workbookName ?? "Not available"}</strong>
      </div>
      <div className="context-grid">
        <div>
          <strong>{dashboardContext.worksheets.length}</strong>
          <span>Worksheets</span>
        </div>
        <div>
          <strong>{dashboardContext.filters.length}</strong>
          <span>Filters</span>
        </div>
        <div>
          <strong>{dashboardContext.parameters.length}</strong>
          <span>Parameters</span>
        </div>
      </div>
    </aside>
  );
}

