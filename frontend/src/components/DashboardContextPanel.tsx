import type { DashboardContext } from "../types/tableau";

type Props = {
  dashboardContext: DashboardContext;
};

export default function DashboardContextPanel({ dashboardContext }: Props) {
  const isMockContext = dashboardContext.contextSource === "mock";

  return (
    <aside className="context-card" aria-label="Dashboard context summary">
      <div className="context-source-row">
        <span className={isMockContext ? "context-source mock" : "context-source live"}>
          {isMockContext ? "Mock context" : "Tableau context"}
        </span>
      </div>
      {dashboardContext.contextWarning ? <div className="context-warning">{dashboardContext.contextWarning}</div> : null}
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
