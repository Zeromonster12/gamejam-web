/**
 * CSV pre slovenský Excel: UTF-8 s BOM, oddeľovač „;“, CRLF.
 *
 * Ochrana proti CSV/formula injection – aj keď súbor niekto otvorí s iným oddeľovačom (čiarka, TAB):
 *  - TAB vo vnútri hodnoty → medzera (pri delení podľa TAB by inak začal nové pole),
 *  - hodnota začínajúca (po prípadných medzerách) = + - @ alebo CR dostane prefix ',
 *  - = + - @ hneď za vloženým oddeľovačom („,“ „;“ CR LF, aj s medzerami) dostane ' – pri delení
 *    podľa čiarky by inak „X,=1+1,Y“ vytvorilo pole „=1+1“, ktoré tabuľkový procesor vyhodnotí.
 */
const DANGEROUS_START = /^(\s*[=+\-@]|\r)/;
const DANGEROUS_AFTER_SEPARATOR = /([,;\r\n]\s*)(?=[=+\-@])/g;

export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (value instanceof Date) s = value.toISOString();
  else if (Array.isArray(value)) s = value.join(", ");
  else s = String(value);
  s = s.replace(/\t/g, " ");
  if (DANGEROUS_START.test(s)) s = `'${s}`;
  s = s.replace(DANGEROUS_AFTER_SEPARATOR, "$1'");
  if (/[";\r\n,]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
