import type { ContextPreviewModel } from "../tableau/contextPreview";

type Props = {
  preview: ContextPreviewModel | null;
};

const SUMMARY_DATA_ROW_LIMIT = 5;
const SELECTED_MARK_ROW_LIMIT = 3;

export default function AIContextPreviewPanel({ preview }: Props) {
  if (!preview) {
    return (
      <aside className="context-preview-panel" aria-label="AI context preview">
        <header className="context-preview-header">
          <div>
            <p className="context-preview-eyebrow">Tableau context</p>
            <h2>AI Context Preview</h2>
            <p className="context-preview-dashboard-name">
              Loading context preview
            </p>
          </div>
        </header>
        <div className="context-preview-empty">
          Tableau context is being collected.
        </div>
      </aside>
    );
  }

  return (
    <aside className="context-preview-panel" aria-label="AI context preview">
      <header className="context-preview-header">
        <div>
          <p className="context-preview-eyebrow">Tableau context</p>
          <h2>AI Context Preview</h2>
          <p className="context-preview-dashboard-name">
            {preview.dashboard.name}
          </p>
        </div>
        <div className="context-preview-badges">
          <span
            className={`context-preview-badge ${preview.availability.status}`}
          >
            {formatAvailabilityStatus(preview.availability.status)}
          </span>
          <span className="context-preview-badge source">
            {preview.metadata.sourceKind}
          </span>
        </div>
      </header>

      <section className="context-preview-section">
        <h3>Overview</h3>
        <dl className="context-preview-dl">
          <div>
            <dt>Dashboard</dt>
            <dd>{preview.dashboard.name}</dd>
          </div>
          <div>
            <dt>Workbook</dt>
            <dd>{preview.workbook.name ?? "No workbook"}</dd>
          </div>
          <div>
            <dt>View</dt>
            <dd>{preview.view.name ?? "No view"}</dd>
          </div>
          <div>
            <dt>Last changed worksheet</dt>
            <dd>{formatLastChangedWorksheet(preview.lastChangedWorksheet)}</dd>
          </div>
          <div>
            <dt>Generated at</dt>
            <dd>{preview.generatedAt}</dd>
          </div>
          <div>
            <dt>Updated at</dt>
            <dd>
              {preview.summaryDataPreview.updatedAt ?? preview.generatedAt}
            </dd>
          </div>
        </dl>
      </section>

      <section className="context-preview-section">
        <h3>Worksheets</h3>
        {preview.worksheets.length === 0 ? (
          <p className="context-preview-empty">No worksheets</p>
        ) : (
          <ul className="context-preview-list">
            {preview.worksheets.map((worksheet) => (
              <li key={worksheet.name}>
                <strong>{worksheet.name}</strong>
                <span>{worksheet.sheetType ?? "worksheet"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="context-preview-section">
        <h3>Filters</h3>
        {preview.filters.length === 0 ? (
          <p className="context-preview-empty">No filters</p>
        ) : (
          <ul className="context-preview-stack">
            {preview.filters.map((filter) => (
              <li
                key={`${filter.worksheetName ?? "dashboard"}:${filter.fieldName}`}
              >
                <div className="context-preview-item-title">
                  <strong>{filter.fieldName}</strong>
                  <span>{filter.worksheetName ?? "Dashboard"}</span>
                </div>
                <div className="context-preview-inline">
                  <span>{describeValueList(filter.appliedValues)}</span>
                  <span>{filter.filterType ?? "filter"}</span>
                  {filter.appliedValues.truncated ? (
                    <span>truncated</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="context-preview-section">
        <h3>Parameters</h3>
        {preview.parameters.length === 0 ? (
          <p className="context-preview-empty">No parameters</p>
        ) : (
          <ul className="context-preview-stack">
            {preview.parameters.map((parameter) => (
              <li key={parameter.name}>
                <div className="context-preview-item-title">
                  <strong>{parameter.name}</strong>
                  <span>{parameter.dataType ?? "parameter"}</span>
                </div>
                <div className="context-preview-inline">
                  <span>Current: {parameter.currentValue.display}</span>
                  <span>{describeValueList(parameter.allowableValues)}</span>
                  {parameter.allowableValues.truncated ? (
                    <span>truncated</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="context-preview-section">
        <h3>Selected Marks</h3>
        {preview.selectedMarks.status === "unavailable" ? (
          <p className="context-preview-empty">No selected marks</p>
        ) : preview.selectedMarks.items.length === 0 ? (
          <p className="context-preview-empty">No selected marks</p>
        ) : (
          <ul className="context-preview-stack">
            {preview.selectedMarks.items.map((mark) => (
              <li key={mark.worksheetName}>
                <div className="context-preview-item-title">
                  <strong>{mark.worksheetName}</strong>
                  <span>
                    {mark.previewRowCount}/{mark.rowCount} rows
                  </span>
                </div>
                <div className="context-preview-inline">
                  <span>{mark.columns.length} columns</span>
                  {mark.truncated ? <span>truncated</span> : null}
                </div>
                {mark.rows.length > 0 ? (
                  <ul className="context-preview-row-list">
                    {mark.rows
                      .slice(0, SELECTED_MARK_ROW_LIMIT)
                      .map((row, index) => (
                        <li key={`${mark.worksheetName}-row-${index}`}>
                          {row.values
                            .map(
                              (cell) =>
                                `${cell.fieldName ?? "Value"}: ${cell.display}`,
                            )
                            .join(" · ")}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="context-preview-empty">No preview rows</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="context-preview-section">
        <h3>Summary Data Preview</h3>
        {preview.summaryDataPreview.status === "notCollected" ? (
          <p className="context-preview-empty">
            Summary data preview has not been collected yet.
          </p>
        ) : preview.summaryDataPreview.status === "unavailable" &&
          preview.summaryDataPreview.note ? (
          <p className="context-preview-empty">
            {preview.summaryDataPreview.note}
          </p>
        ) : preview.summaryDataPreview.items.length === 0 ? (
          <p className="context-preview-empty">No summary data preview</p>
        ) : (
          <div className="context-preview-summary-stack">
            {preview.summaryDataPreview.items.map((worksheet) => (
              <section
                key={worksheet.worksheetId ?? worksheet.worksheetName}
                className="context-preview-summary-card"
              >
                <div className="context-preview-item-title">
                  <strong>{worksheet.worksheetName}</strong>
                  <span>
                    {worksheet.previewRowCount}/{worksheet.totalRowCount} rows
                  </span>
                </div>
                <div className="context-preview-inline">
                  <span>
                    {worksheet.previewColumnCount}/{worksheet.totalColumnCount}{" "}
                    columns
                  </span>
                  <span>{worksheet.status}</span>
                  {worksheet.truncated ? <span>truncated</span> : null}
                </div>
                {worksheet.status === "unavailable" ? (
                  <p className="context-preview-empty">
                    {worksheet.errorMessage ?? "Summary data unavailable"}
                  </p>
                ) : worksheet.columns.length === 0 ? (
                  <p className="context-preview-empty">No summary columns</p>
                ) : (
                  <div className="context-preview-table-wrap">
                    <table className="context-preview-table">
                      <thead>
                        <tr>
                          {worksheet.columns.map((column) => (
                            <th key={column.name}>{column.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {worksheet.rows
                          .slice(0, SUMMARY_DATA_ROW_LIMIT)
                          .map((row, rowIndex) => (
                            <tr
                              key={`${worksheet.worksheetName}-summary-${rowIndex}`}
                            >
                              {row.values.map((cell, cellIndex) => (
                                <td
                                  key={`${worksheet.worksheetName}-summary-${rowIndex}-${cellIndex}`}
                                >
                                  {cell.display}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="context-preview-section">
        <h3>Availability / Warnings</h3>
        <dl className="context-preview-dl">
          <div>
            <dt>Workbook ID</dt>
            <dd>{preview.availability.workbookId}</dd>
          </div>
          <div>
            <dt>View ID</dt>
            <dd>{preview.availability.viewId}</dd>
          </div>
          <div>
            <dt>Datasource fields</dt>
            <dd>{preview.availability.datasourceFields}</dd>
          </div>
        </dl>
        {preview.warnings.length === 0 ? (
          <p className="context-preview-empty">No warnings</p>
        ) : (
          <ul className="context-preview-stack">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function describeValueList(valueList: {
  items: string[];
  totalCount: number;
  truncated: boolean;
}): string {
  if (valueList.items.length === 0) {
    return "No values";
  }

  const summary = valueList.items.join(", ");
  return valueList.truncated
    ? `${summary} (+${valueList.totalCount - valueList.items.length} more)`
    : summary;
}

function formatAvailabilityStatus(status: string): string {
  if (status === "available") {
    return "Available";
  }
  if (status === "partial") {
    return "Partial";
  }
  return "Unavailable";
}

function formatLastChangedWorksheet(
  lastChangedWorksheet: ContextPreviewModel["lastChangedWorksheet"],
): string {
  if (!lastChangedWorksheet) {
    return "Not available";
  }

  const parts = [lastChangedWorksheet.worksheetName];
  if (lastChangedWorksheet.changedAt) {
    parts.push(lastChangedWorksheet.changedAt);
  }
  if (lastChangedWorksheet.source) {
    parts.push(lastChangedWorksheet.source);
  }

  return parts.join(" · ");
}
