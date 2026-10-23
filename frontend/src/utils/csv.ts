export function serializeCsv(rows: string[][]) {
  const escape = (value: string) => {
    const unsafe = /^[\s\uFEFF]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value);
    const safe = unsafe ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + rows.map((row) => row.map(escape).join(';')).join('\r\n');
}
