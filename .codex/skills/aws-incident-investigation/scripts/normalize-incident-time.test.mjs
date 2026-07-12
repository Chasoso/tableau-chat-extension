import assert from "node:assert/strict";
import test from "node:test";
import {
  getTimeZoneOffsetMinutes,
  normalizeIncidentWindow,
  parseIncidentTime,
  resolveUtcInstant,
} from "./normalize-incident-time.mjs";

test("normalizes JST incident time to UTC", () => {
  const result = normalizeIncidentWindow({
    time: "2026-07-11 23:18",
    timezone: "Asia/Tokyo",
  });

  assert.equal(result.centerUtc, "2026-07-11T14:18:00.000Z");
  assert.equal(result.windowStartUtc, "2026-07-11T14:08:00.000Z");
  assert.equal(result.windowEndUtc, "2026-07-11T14:28:00.000Z");
});

test("defaults to Asia/Tokyo when timezone is omitted", () => {
  const result = normalizeIncidentWindow({
    time: "2026-07-11 23:18",
  });

  assert.equal(result.timezone, "Asia/Tokyo");
  assert.equal(result.assumedTimezone, true);
});

test("parses incident time and fixed offsets", () => {
  const parsed = parseIncidentTime("2026-07-11 23:18");
  assert.equal(parsed.year, 2026);
  assert.equal(
    getTimeZoneOffsetMinutes("+09:00", Date.UTC(2026, 6, 11, 0, 0)),
    540,
  );
  assert.equal(
    resolveUtcInstant(parsed, "+09:00"),
    Date.UTC(2026, 6, 11, 14, 18),
  );
});
