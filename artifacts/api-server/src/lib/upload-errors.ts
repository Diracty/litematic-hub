export function uploadParseErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Failed to parse litematic file";
  }

  const msg = err.message;
  const lower = msg.toLowerCase();

  if (
    lower.includes("heap") ||
    lower.includes("allocation failed") ||
    lower.includes("out of memory") ||
    lower.includes("array buffer allocation")
  ) {
    return (
      "Schematic is too large for server memory. Try chunk mode, fewer entities, " +
      "or a smaller region."
    );
  }

  if (lower.includes("invalid distance code") || lower.includes("incorrect header check")) {
    return "File is not a valid gzip .litematic archive.";
  }

  if (msg.length > 0 && msg.length < 300) {
    return msg;
  }

  return "Failed to parse litematic file";
}
