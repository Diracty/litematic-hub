import { createContext, useContext, useState, ReactNode } from "react";

export type Lang = "ru" | "en";

const ru = {
  // Layout
  footerText: "Инструмент для Minecraft-строителей.",

  // Home
  homeTitle: "Панель управления",
  homeSubtitle: "Загружайте .litematic файлы и разбивайте их на JSON-части.",

  // FileUpload
  uploadDropTitle: "Нажмите или перетащите .litematic файл",
  uploadDropSub: "До 50МБ",
  uploadCancel: "Отмена",
  uploadConfirm: "Загрузить и распарсить",
  uploadPending: "Загрузка...",
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
  uploadToastTooLarge: "Максимальный размер — 50МБ.",
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

  // FileDetail
  btnBack: "Назад",
  btnDownloadParsed: "Скачать распарсенный",
  labelBlocksDetail: "Блоки",
  labelEntities: "Сущности",
  labelBlockEntities: "Блоки-сущности",
  labelRegions: "Регионы",
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

  homeTitle: "Workshop Dashboard",
  homeSubtitle: "Upload .litematic files to parse them into manageable JSON chunks.",

  uploadDropTitle: "Click or drag .litematic file here",
  uploadDropSub: "Up to 50MB",
  uploadCancel: "Cancel",
  uploadConfirm: "Upload & Parse",
  uploadPending: "Uploading...",
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
  uploadToastTooLarge: "Maximum file size is 50MB.",
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
