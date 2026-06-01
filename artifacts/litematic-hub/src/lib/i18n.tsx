import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "ru" | "en";

const ru = {
  // Layout
  footerText: "Инструмент для Minecraft-строителей.",

  // Home
  homeTitle: "Панель управления",
  homeSubtitle: "Загружайте .litematic файлы и разбивайте их на JSON-части.",

  // API Docs panel
  docsTitle: "Как это работает",
  docsFormatTitle: "Формат вывода",
  docsFormatDesc: "После загрузки файл разбивается на пронумерованные части — JSON-массивы с записями трёх типов:",
  docsTypeBlock: "block — один тип блока со списком всех его координат",
  docsTypeBlockEntity: "blockEntity — блоки с данными (сундуки, печки и т.д.)",
  docsTypeEntity: "entity — сущности (мобы, предметы). Всегда в конце.",
  docsApiTitle: "Публичный API",
  docsApiDesc: "Каждый файл доступен по уникальному ключу без авторизации:",
  docsApiInfo: "Имя схематики и количество частей",
  docsApiPart: "JSON-данные конкретной части (нумерация с 1)",

  // FileUpload
  uploadDropTitle: "Нажмите или перетащите .litematic файл",
  uploadDropSub: "До 100 МБ (большие файлы парсятся дольше)",
  uploadCancel: "Отмена",
  uploadConfirm: "Загрузить и распарсить",
  uploadPending: "Загрузка...",
  uploadParsing: "Парсинг на сервере…",
  uploadQueued: "Файл принят, парсинг на сервере…",
  uploadParseProgress: "Парсинг {pct}%",
  uploadProgress: "Загрузка {pct}%",
  uploadSettingsLabel: "Настройки парсинга",
  uploadLabelMaxCoords: "Макс. координат в части",
  uploadLabelMaxChars: "Макс. символов в части",
  uploadLabelChunkMode: "Режим чанков",
  uploadLabelEntityMode: "Режим сущностей",
  uploadLabelBlockEntities: "Блоки-сущности",
  uploadLabelBiomes: "Биомы",
  uploadChunkOff: "Выкл.",
  uploadEntityOff: "Выкл.",
  uploadEntityNbt: "NBT",
  uploadEntityEggs: "Яйца",
  uploadToastSuccessTitle: "Загрузка успешна",
  uploadToastSuccessDesc: "Файл обработан.",
  uploadToastFailTitle: "Ошибка загрузки",
  uploadToastInvalidType: "Поддерживаются только файлы .litematic.",
  uploadToastTooLarge: "Максимальный размер — 100 МБ.",
  uploadInvalidTypeTitle: "Неверный тип файла",
  uploadTooLargeTitle: "Файл слишком большой",

  // FileList
  yourFiles: "Ваши файлы",
  noFilesTitle: "Нет файлов",
  noFilesSub: "Загрузите .litematic файл выше.",
  failedLoad: "Не удалось загрузить файлы. Обновите страницу.",
  labelParts: "Части",
  labelSize: "Размер",
  labelBlocks: "Блоки",
  btnInspect: "Просмотр частей",
  btnDownloadTitle: "Скачать",
  btnDeleteTitle: "Удалить",
  confirmDelete: "Удалить этот файл?",
  toastDeletedTitle: "Файл удалён",
  toastDeletedDesc: "Файл был удалён.",
  toastDeleteFailTitle: "Ошибка удаления",
  toastDeleteFailDesc: "Не удалось удалить файл.",

  // FileDetail — stats
  btnBack: "Назад",
  btnDownloadParsed: "Скачать распарсенный",
  labelBlocksDetail: "Блоки",
  labelEntities: "Сущности",
  labelBlockEntities: "Блоки-сущности",
  labelRegions: "Регионы",
  labelDimensions: "Размер схематики",

  // FileDetail — tabs
  tabContents: "Содержимое",
  tabParts: "Части",

  // FileDetail — contents viewer
  contentsBlocks: "Блоки",
  contentsEntities: "Сущности",
  contentsBlockEntities: "Блоки-сущности",
  contentsEmpty: "Нет данных.",
  contentsTotal: "всего",
  contentsDimX: "X",
  contentsDimY: "Y",
  contentsDimZ: "Z",
  contentsDimLabel: "Размер (X × Y × Z)",

  // FileDetail — parts viewer
  partsListTitle: "Части",
  viewerTitle: "Просмотр",
  viewerEmpty: "Выберите часть из списка для просмотра JSON.",
  partDataTitle: "Данные части",
  partChars: "симв.",
  btnCopyJson: "Скопировать JSON",
  toastCopiedTitle: "Скопировано",
  toastCopiedDesc: "Данные части скопированы.",
  fileNotFoundTitle: "Файл не найден",
  fileNotFoundDesc: "Файл не существует или был удалён.",

  // 404
  notFoundTitle: "404 — Страница не найдена",
  notFoundDesc: "Страница не существует.",
};

const en: typeof ru = {
  footerText: "Precision devtool for Minecraft builders.",

  homeTitle: "Dashboard",
  homeSubtitle: "Upload .litematic files and split them into numbered JSON parts.",

  docsTitle: "How it works",
  docsFormatTitle: "Output format",
  docsFormatDesc: "After uploading, the file is split into numbered parts — JSON arrays with three entry types:",
  docsTypeBlock: "block — one block type with all its coordinates",
  docsTypeBlockEntity: "blockEntity — blocks with data (chests, furnaces, etc.)",
  docsTypeEntity: "entity — mobs and items. Always last in every part.",
  docsApiTitle: "Public API",
  docsApiDesc: "Every file is accessible by its unique key, no auth required:",
  docsApiInfo: "Schematic name and total part count",
  docsApiPart: "JSON data for a specific part (1-based index)",

  uploadDropTitle: "Click or drag .litematic file here",
  uploadDropSub: "Up to 100 MB (large files take longer to parse)",
  uploadCancel: "Cancel",
  uploadConfirm: "Upload & Parse",
  uploadPending: "Uploading...",
  uploadParsing: "Parsing on server…",
  uploadQueued: "File accepted, parsing on server…",
  uploadParseProgress: "Parsing {pct}%",
  uploadProgress: "Upload {pct}%",
  uploadSettingsLabel: "Parse Settings",
  uploadLabelMaxCoords: "Max Coords per Part",
  uploadLabelMaxChars: "Max Chars per Part",
  uploadLabelChunkMode: "Chunk Mode",
  uploadLabelEntityMode: "Entity Mode",
  uploadLabelBlockEntities: "Block Entities",
  uploadLabelBiomes: "Biomes",
  uploadChunkOff: "Off",
  uploadEntityOff: "Off",
  uploadEntityNbt: "NBT",
  uploadEntityEggs: "Eggs",
  uploadToastSuccessTitle: "Upload successful",
  uploadToastSuccessDesc: "Your litematic file has been processed.",
  uploadToastFailTitle: "Upload failed",
  uploadToastInvalidType: "Only .litematic files are supported.",
  uploadToastTooLarge: "Maximum file size is 100 MB.",
  uploadInvalidTypeTitle: "Invalid file type",
  uploadTooLargeTitle: "File too large",

  yourFiles: "Your Files",
  noFilesTitle: "No files yet",
  noFilesSub: "Upload a .litematic file above to get started.",
  failedLoad: "Failed to load your files. Please try refreshing.",
  labelParts: "Parts",
  labelSize: "Size",
  labelBlocks: "Blocks",
  btnInspect: "Inspect Parts",
  btnDownloadTitle: "Download",
  btnDeleteTitle: "Delete",
  confirmDelete: "Delete this file?",
  toastDeletedTitle: "File deleted",
  toastDeletedDesc: "The file has been permanently removed.",
  toastDeleteFailTitle: "Delete failed",
  toastDeleteFailDesc: "Could not delete the file. Please try again.",

  btnBack: "Back",
  btnDownloadParsed: "Download Parsed",
  labelBlocksDetail: "Blocks",
  labelEntities: "Entities",
  labelBlockEntities: "Block Entities",
  labelRegions: "Regions",
  labelDimensions: "Schematic Size",

  tabContents: "Contents",
  tabParts: "Parts",

  contentsBlocks: "Blocks",
  contentsEntities: "Entities",
  contentsBlockEntities: "Block Entities",
  contentsEmpty: "No data.",
  contentsTotal: "total",
  contentsDimX: "X",
  contentsDimY: "Y",
  contentsDimZ: "Z",
  contentsDimLabel: "Size (X × Y × Z)",

  partsListTitle: "Parts",
  viewerTitle: "Viewer",
  viewerEmpty: "Select a part from the list to view its JSON payload.",
  partDataTitle: "Part Data",
  partChars: "chars",
  btnCopyJson: "Copy JSON",
  toastCopiedTitle: "Copied",
  toastCopiedDesc: "Part JSON data copied.",
  fileNotFoundTitle: "File not found",
  fileNotFoundDesc: "The file you are looking for does not exist or has been deleted.",

  notFoundTitle: "404 Page Not Found",
  notFoundDesc: "Did you forget to add the page to the router?",
};

const translations: Record<Lang, typeof ru> = { ru, en };

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof ru;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "ru",
  setLang: () => {},
  t: ru,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = (typeof localStorage !== "undefined" ? localStorage.getItem("lh-lang") : null) as Lang | null;
  const [lang, setLangState] = useState<Lang>(stored ?? "ru");

  const setLang = (l: Lang) => {
    localStorage.setItem("lh-lang", l);
    setLangState(l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
