/**
 * CSV pre slovenský Excel: UTF-8 s BOM, oddeľovač „;“, CRLF.
 * Ochrana proti CSV/formula injection: hodnoty začínajúce = + - @ TAB CR dostanú prefix '.
 */
const DANGEROUS_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (value instanceof Date) s = value.toISOString();
  else if (Array.isArray(value)) s = value.join(", ");
  else s = String(value);
  if (DANGEROUS_START.test(s)) s = `'${s}`;
  if (/[";\r\n,]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
