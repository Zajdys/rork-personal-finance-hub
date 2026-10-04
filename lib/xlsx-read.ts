/**
 * SheetJS workbook reader — vždy `type: 'base64'`.
 *
 * Na iOS/RN cesta `type: 'array'` / ArrayBuffer často končí
 * „Bad uncompressed size: N != 0“. App čte soubor přes
 * expo-file-system (EncodingType.Base64); Bun selftesty
 * ArrayBuffer nejdřív převedou na base64.
 */
import * as XLSX from 'xlsx';

function toBase64(fileContent: string | ArrayBuffer): string {
  if (typeof fileContent === 'string') return fileContent;
  // Bun / Node (selftest) — v RN se ArrayBuffer nepoužívá.
  return Buffer.from(new Uint8Array(fileContent)).toString('base64');
}

export function readXlsxWorkbook(
  fileContent: string | ArrayBuffer,
  opts?: Omit<XLSX.ParsingOptions, 'type'>,
): XLSX.WorkBook {
  return XLSX.read(toBase64(fileContent), { ...opts, type: 'base64' });
}
