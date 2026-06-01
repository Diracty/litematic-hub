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
      "Не хватило оперативной памяти на сервере. Для файла ~30 МБ: Push последнего кода, " +
      "полный редеплой, PARSE_HEAP_MB=1200. Крупные файлы парсятся по регионам автоматически."
    );
  }

  if (lower.includes("invalid distance code") || lower.includes("incorrect header check")) {
    return "File is not a valid gzip .litematic archive.";
  }

  if (lower.includes("array size is abnormally large")) {
    return (
      "Schematic contains very large block data. Update the server (noArraySizeCheck) " +
      "or split the build into smaller regions."
    );
  }

  if (msg.length > 0 && msg.length < 300) {
    return msg;
  }

  return "Failed to parse litematic file";
}
