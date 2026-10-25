/** Trigger a browser download for in-memory text (e.g. a CSV export). */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
