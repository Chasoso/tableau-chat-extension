import process from "node:process";
import { pathToFileURL } from "node:url";

export function normalizeIncidentWindow(input) {
  const time = parseIncidentTime(input.time);
  const timezone = input.timezone?.trim() || "Asia/Tokyo";
  const windowMinutes = Number.isFinite(input.windowMinutes)
    ? input.windowMinutes
    : 10;
  const centerUtcMs = resolveUtcInstant(time, timezone);
  const windowMs = windowMinutes * 60_000;

  return {
    reportedTime: input.time,
    timezone,
    assumedTimezone: !input.timezone?.trim(),
    windowMinutes,
    centerUtc: new Date(centerUtcMs).toISOString(),
    windowStartUtc: new Date(centerUtcMs - windowMs).toISOString(),
    windowEndUtc: new Date(centerUtcMs + windowMs).toISOString(),
  };
}

export function parseIncidentTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value.trim(),
    );

  if (!match) {
    throw new Error(
      "Incident time must use YYYY-MM-DD or YYYY-MM-DD HH:mm format.",
    );
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

export function resolveUtcInstant(localTime, timeZone) {
  const baseUtc = Date.UTC(
    localTime.year,
    localTime.month - 1,
    localTime.day,
    localTime.hour,
    localTime.minute,
    localTime.second,
  );

  let guessUtc = baseUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, guessUtc);
    const nextGuessUtc = baseUtc - offsetMinutes * 60_000;
    if (nextGuessUtc === guessUtc) {
      return guessUtc;
    }
    guessUtc = nextGuessUtc;
  }

  return guessUtc;
}

export function getTimeZoneOffsetMinutes(timeZone, utcMs) {
  const fixedOffset = parseFixedOffsetMinutes(timeZone);
  if (fixedOffset !== undefined) {
    return fixedOffset;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));

  const normalized = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const localAsUtc = Date.UTC(
    Number(normalized.year),
    Number(normalized.month) - 1,
    Number(normalized.day),
    Number(normalized.hour),
    Number(normalized.minute),
    Number(normalized.second),
  );

  return Math.round((localAsUtc - utcMs) / 60_000);
}

function parseFixedOffsetMinutes(timeZone) {
  const normalized = timeZone.trim().toUpperCase();
  if (normalized === "Z" || normalized === "UTC" || normalized === "GMT") {
    return 0;
  }

  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -total : total;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const timeIndex = process.argv.indexOf("--time");
  const timezoneIndex = process.argv.indexOf("--timezone");
  const windowIndex = process.argv.indexOf("--window-minutes");

  const result = normalizeIncidentWindow({
    time: timeIndex >= 0 ? process.argv[timeIndex + 1] : "",
    timezone: timezoneIndex >= 0 ? process.argv[timezoneIndex + 1] : undefined,
    windowMinutes:
      windowIndex >= 0 ? Number(process.argv[windowIndex + 1]) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}
