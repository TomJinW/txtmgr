import { ref } from "vue";

export type AppLanguage = "en" | "zh-Hans";

export const appLanguageStorageKey = "txtmgr.appLanguage.v1";

// Keep this union explicit. It makes missing translations a TypeScript error
// instead of a runtime surprise in a modal or menu.
type TranslationKey =
  | "app.language"
  | "common.add"
  | "common.all"
  | "common.browse"
  | "common.cancel"
  | "common.clear"
  | "common.close"
  | "common.delete"
  | "common.done"
  | "common.apply"
  | "common.stop"
  | "common.stopping"
  | "common.export"
  | "common.import"
  | "common.importing"
  | "common.check"
  | "common.path"
  | "common.ready"
  | "common.reset"
  | "common.save"
  | "common.saving"
  | "common.searchText"
  | "common.selected"
  | "common.theme"
  | "menu.file"
  | "menu.tools"
  | "menu.statistics"
  | "theme.system"
  | "theme.light"
  | "theme.dark"
  | "match.contains"
  | "match.exact"
  | "font.default"
  | "font.sc"
  | "font.tc"
  | "font.jp"
  | "font.kr"
  | "main.readJson"
  | "main.saveJson"
  | "main.saveJsonAs"
  | "main.importExcel"
  | "main.exportExcel"
  | "main.clearList"
  | "main.deleteSelected"
  | "main.noJsonFileLoaded"
  | "main.noJsonSavePath"
  | "main.caseSensitive"
  | "main.length"
  | "main.min"
  | "main.max"
  | "main.to"
  | "main.statusFilters"
  | "main.rows"
  | "main.goToRow"
  | "main.go"
  | "main.font"
  | "main.addRowAtEnd"
  | "main.selectFilteredRows"
  | "main.sentenceList"
  | "main.originalEqualsTranslated"
  | "main.originalNotEqualsTranslated"
  | "main.emptyTranslation"
  | "main.hasNote"
  | "main.duplicateTitleAddr"
  | "encoding.title"
  | "encoding.character"
  | "encoding.note"
  | "encoding.readJson"
  | "encoding.saveJson"
  | "encoding.importTbl"
  | "encoding.exportTbl"
  | "encoding.importExcel"
  | "encoding.exportExcel"
  | "encoding.encodingList"
  | "encoding.duplicateCharacter"
  | "encoding.duplicateCode"
  | "encoding.emptyCharacter"
  | "encoding.emptyCode"
  | "encoding.punctuation"
  | "encoding.han"
  | "encoding.kana"
  | "encoding.hangul"
  | "encoding.latin"
  | "encoding.special"
  | "dialog.importExcel"
  | "dialog.exportExcel"
  | "dialog.importSrt"
  | "dialog.exportSrt"
  | "dialog.importTbl"
  | "dialog.exportTbl"
  | "dialog.startRow"
  | "dialog.outputEncoding"
  | "dialog.filteredOnly"
  | "dialog.appendRows"
  | "dialog.keepRowNumber"
  | "dialog.splitByFileName"
  | "dialog.dualLanguageSrt"
  | "dialog.rowsColumnsStartAtOne"
  | "dialog.lineFormat"
  | "dialog.encoding"
  | "dialog.autoDetect"
  | "dialog.extension"
  | "dialog.newline"
  | "dialog.exportTblWarning"
  | "dialog.charColumnRequired"
  | "dialog.codeColumnRequired"
  | "dialog.widthColumnOptional"
  | "dialog.noteColumnOptional"
  | "dialog.optional"
  | "dialog.required"
  | "dialog.defaultUnmarked"
  | "dialog.requiredForColumn"
  | "dialog.fileNameSource"
  | "dialog.none"
  | "dialog.column"
  | "dialog.sheetName"
  | "dialog.srtImportHint"
  | "dialog.excelWorkbook"
  | "dialog.srtSubtitle"
  | "dialog.textFile"
  | "dialog.textTable"
  | "message.rows"
  | "message.excelImported"
  | "message.excelAppended"
  | "message.srtImported"
  | "message.srtAppended"
  | "message.excelExported"
  | "message.srtExported"
  | "message.imported"
  | "message.appended"
  | "message.exported"
  | "message.noRowsToExport"
  | "message.noValidExcelRows"
  | "message.noValidSrtRows"
  | "message.failedImportExcel"
  | "message.failedImportSrt"
  | "message.failedExportExcel"
  | "message.failedExportSrt"
  | "message.failedExportTextTable"
  | "message.importOverwrite"
  | "message.encodingImportOverwrite"
  | "message.failedImportTextTable"
  | "message.noMatchingSentenceRows"
  | "message.noMatchingEncodingRows"
  | "message.addEncodingRowsToStart"
  | "message.noMatchingCharactersFound"
  | "message.countedItemsFromRows"
  | "message.notCheckedYet"
  | "message.clearListConfirm"
  | "message.listCleared"
  | "message.deleteSelectedConfirmPrefix"
  | "message.deleteSelectedConfirmSuffix"
  | "message.deletedSelected"
  | "message.noRowsSelected"
  | "message.dialogTaskRunning"
  | "message.restoredLocalDraft"
  | "message.autoSavedLocal"
  | "message.failedAutoSave"
  | "message.loadedAndAutoSaved"
  | "message.loadedRows"
  | "message.jsonSaved"
  | "message.failedSaveJson"
  | "message.failedReadJson"
  | "message.jsonRootMustBeArray"
  | "message.encodingJsonRootMustBeRows"
  | "message.mustBeNumberFromOne"
  | "message.lineDoesNotContainEqualsPrefix"
  | "message.lineDoesNotContainEqualsSuffix"
  | "message.changedSelectedRowsToPrefix"
  | "message.changedSelectedRowsToSuffix"
  | "message.importedExcelFileName"
  | "message.invalidExcelZipCentralDirectory"
  | "message.invalidExcelZipFile"
  | "message.excelDecompressUnavailable"
  | "message.excelZipEntryBadDecompress"
  | "message.excelXmlParseFailed"
  | "message.undidTableChange"
  | "message.redidTableChange"
  | "message.rowAdded"
  | "message.noRowsToJump"
  | "message.enterRowRangePrefix"
  | "message.enterRowRangeSuffix"
  | "message.rowHiddenByFiltersPrefix"
  | "message.rowHiddenByFiltersSuffix"
  | "message.jumpedToRow"
  | "message.characterCountCopied"
  | "message.failedCopyCharacterCount"
  | "message.clipboardUnavailable"
  | "message.translationResultDiscarded"
  | "message.llmSettingsSaved"
  | "message.llmApiKeySaved"
  | "message.llmApiKeyCleared"
  | "message.llmSettingsReset"
  | "message.encodingListCleared"
  | "ai.title"
  | "ai.subtitle"
  | "ai.rows"
  | "ai.rowsToTranslate"
  | "ai.sourceLanguage"
  | "ai.targetLanguage"
  | "ai.minimumOriginalCharacters"
  | "ai.promptTemplate"
  | "ai.defaultGamePrompt"
  | "ai.defaultVideoPrompt"
  | "ai.timeoutSeconds"
  | "ai.temperature"
  | "ai.attachmentTxtFile"
  | "ai.attachmentPlaceholder"
  | "ai.viewResult"
  | "ai.fakeTranslate"
  | "ai.translate"
  | "ai.translating"
  | "ai.translationResult"
  | "ai.runningTranslation"
  | "ai.total"
  | "ai.done"
  | "ai.pending"
  | "ai.errors"
  | "ai.applied"
  | "ai.original"
  | "ai.translatedPreview"
  | "ai.selectAll"
  | "ai.applySelected"
  | "ai.discardResult"
  | "ai.candidate"
  | "ai.status"
  | "ai.label"
  | "ai.waitingForRow"
  | "ai.waitingForPreview"
  | "ai.loadingTaskRows"
  | "ai.setStateToTemp"
  | "ai.appliedToTable"
  | "ai.noSelectedResultsApplied"
  | "ai.appliedResults"
  | "ai.appliedResultsAndTemp"
  | "ai.discardResultConfirm"
  | "ai.discardResultTitle"
  | "ai.noResultExists"
  | "ai.returnedFromResult"
  | "ai.defaultGamePromptRestored"
  | "ai.defaultVideoPromptRestored"
  | "ai.selectTxtAttachmentTitle"
  | "ai.attachmentSelected"
  | "ai.attachmentCleared"
  | "ai.replaceResultConfirm"
  | "ai.replaceResultTitle"
  | "ai.currentResultKept"
  | "ai.baseUrlRequired"
  | "ai.modelRequired"
  | "ai.failedReadAttachment"
  | "ai.startingFakeTranslation"
  | "ai.startingAiTranslation"
  | "ai.fakeTranslatingRow"
  | "ai.translatingRow"
  | "ai.stoppedBeforeRow"
  | "ai.notTranslated"
  | "ai.noRowsMatchScope"
  | "ai.translationStopped"
  | "ai.translationComplete"
  | "ai.failedStartTranslation"
  | "ai.waitingForTranslation"
  | "ai.fakeStoppedBeforeRow"
  | "ai.simulatedTranslationNote"
  | "ai.simulatedTranslationComplete"
  | "ai.requestComplete"
  | "ai.requestFailed"
  | "ai.stoppingTranslation"
  | "ai.scope.all"
  | "ai.scope.selected"
  | "ai.scope.filtered"
  | "llm.title"
  | "llm.subtitle"
  | "llm.serverType"
  | "llm.localServer"
  | "llm.cloudServer"
  | "llm.provider"
  | "llm.baseUrl"
  | "llm.model"
  | "llm.apiKey"
  | "llm.saveKey"
  | "llm.clearKey"
  | "llm.organization"
  | "llm.project"
  | "llm.extraRequestJson"
  | "llm.extraRequestHelp"
  | "llm.testConnection"
  | "llm.testing"
  | "llm.timeoutSaved"
  | "llm.enterApiKeyBeforeSaving"
  | "llm.apiKeySavedCredential"
  | "llm.failedSaveApiKey"
  | "llm.apiKeyCleared"
  | "llm.failedClearApiKey"
  | "llm.settingsResetApiKeyUnchanged"
  | "llm.testingConnection"
  | "llm.failedTestConnection"
  | "llm.failedReadApiKeyState"
  | "llm.connectionSucceeded"
  | "llm.modelNameNotValidated"
  | "llm.providerPlaceholder"
  | "llm.apiKeyPlaceholder"
  | "llm.optionalPlaceholder"
  | "stats.characterCount"
  | "stats.run"
  | "stats.copyResult"
  | "stats.result"
  | "stats.scope"
  | "stats.characterTypes"
  | "stats.sortOrder"
  | "stats.desc"
  | "stats.asc"
  | "stats.ignoreWhitespace"
  | "stats.rows"
  | "stats.rowsCounted"
  | "stats.allRows"
  | "stats.filteredRows"
  | "stats.selectedRows"
  | "stats.sort"
  | "stats.western"
  | "stats.fullwidth"
  | "stats.halfwidth"
  | "stats.token"
  | "stats.bracketTokens"
  | "stats.cleanup"
  | "stats.running"
  | "stats.notCountedYet"
  | "stats.countingCharacters"
  | "stats.checkingUnmappedCharacters"
  | "stats.checkingUnusedEncodings"
  | "stats.noUnmappedCharactersFound"
  | "stats.foundUnmappedCharacters"
  | "stats.occurrences"
  | "stats.noUnusedEncodingsFound"
  | "stats.foundUnusedEncodings"
  | "stats.unmappedCharacterResultCopied"
  | "stats.failedCopyUnmappedCharacterResult"
  | "stats.unusedEncodingResultCopied"
  | "stats.failedCopyUnusedEncodingResult"
  | "stats.checkingLineLength"
  | "stats.noOverlongNaturalLinesFound"
  | "stats.foundOverlongNaturalLines"
  | "stats.lineLengthResultCopied"
  | "stats.failedCopyLineLengthResult"
  | "stats.unmappedCharacters"
  | "stats.unusedEncodings"
  | "stats.textRowsScanned"
  | "lineLength.title"
  | "lineLength.maxLength"
  | "lineLength.widthRules"
  | "lineLength.type"
  | "lineLength.source"
  | "lineLength.fixedFallback"
  | "lineLength.encodingWidth"
  | "lineLength.fixedValue"
  | "lineLength.other"
  | "lineLength.help"
  | "bulk.title"
  | "bulk.state"
  | "bulk.selectedRows";

const translations: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: {
    "app.language": "Language",
    "common.add": "Add",
    "common.all": "All",
    "common.browse": "Browse",
    "common.cancel": "Cancel",
    "common.clear": "Clear",
    "common.close": "Close",
    "common.delete": "Delete",
    "common.done": "Done",
    "common.apply": "Apply",
    "common.stop": "Stop",
    "common.stopping": "Stopping...",
    "common.export": "Export",
    "common.import": "Import",
    "common.importing": "Importing...",
    "common.check": "Check",
    "common.path": "Path",
    "common.ready": "Ready.",
    "common.reset": "Reset",
    "common.save": "Save",
    "common.saving": "Saving...",
    "common.searchText": "Search text...",
    "common.selected": "Selected",
    "common.theme": "Theme",
    "menu.file": "File",
    "menu.tools": "Tools",
    "menu.statistics": "Statistics",
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "match.contains": "Contains",
    "match.exact": "Exact",
    "font.default": "Default",
    "font.sc": "S.Chinese",
    "font.tc": "T.Chinese",
    "font.jp": "Japanese",
    "font.kr": "Korean",
    "main.readJson": "Read JSON",
    "main.saveJson": "Save JSON",
    "main.saveJsonAs": "Save JSON As",
    "main.importExcel": "Import Excel",
    "main.exportExcel": "Export Excel",
    "main.clearList": "Clear List",
    "main.deleteSelected": "Delete Selected",
    "main.noJsonFileLoaded": "No JSON file loaded",
    "main.noJsonSavePath": "No JSON save path selected",
    "main.caseSensitive": "Case sensitive",
    "main.length": "Length",
    "main.min": "Min",
    "main.max": "Max",
    "main.to": "to",
    "main.statusFilters": "Status Filters",
    "main.rows": "Rows",
    "main.goToRow": "Go to row",
    "main.go": "Go",
    "main.font": "Font",
    "main.addRowAtEnd": "Add row at end",
    "main.selectFilteredRows": "Select filtered rows",
    "main.sentenceList": "Sentence list",
    "main.originalEqualsTranslated": "original == translated",
    "main.originalNotEqualsTranslated": "original != translated",
    "main.emptyTranslation": "Empty translation",
    "main.hasNote": "Has note",
    "main.duplicateTitleAddr": "Duplicate title_addr",
    "encoding.title": "Encoding Manager",
    "encoding.character": "Character",
    "encoding.note": "Note",
    "encoding.readJson": "Read JSON",
    "encoding.saveJson": "Save JSON",
    "encoding.importTbl": "Import TBL",
    "encoding.exportTbl": "Export TBL",
    "encoding.importExcel": "Import Excel",
    "encoding.exportExcel": "Export Excel",
    "encoding.encodingList": "Encoding list",
    "encoding.duplicateCharacter": "Duplicate character",
    "encoding.duplicateCode": "Duplicate code",
    "encoding.emptyCharacter": "Empty character",
    "encoding.emptyCode": "Empty code",
    "encoding.punctuation": "Punctuation",
    "encoding.han": "Han",
    "encoding.kana": "Kana",
    "encoding.hangul": "Hangul",
    "encoding.latin": "Latin",
    "encoding.special": "Special",
    "dialog.importExcel": "Import Excel",
    "dialog.exportExcel": "Export Excel",
    "dialog.importSrt": "Import SRT",
    "dialog.exportSrt": "Export SRT",
    "dialog.importTbl": "Import Text Table",
    "dialog.exportTbl": "Export Text Table",
    "dialog.startRow": "Start row",
    "dialog.outputEncoding": "Output encoding",
    "dialog.filteredOnly": "Export current filtered results",
    "dialog.appendRows": "Append imported rows to the end",
    "dialog.keepRowNumber": "Keep row number column",
    "dialog.splitByFileName": "Use file_name as separate sheets",
    "dialog.dualLanguageSrt": "Dual language: translated_text + original_text",
    "dialog.rowsColumnsStartAtOne": "Rows and columns start from 1, matching Excel.",
    "dialog.lineFormat": "Line format",
    "dialog.encoding": "Encoding",
    "dialog.autoDetect": "Auto detect",
    "dialog.extension": "Extension",
    "dialog.newline": "Newline",
    "dialog.exportTblWarning": "Only char and code are exported. Width and note are not saved.",
    "dialog.charColumnRequired": "char column (required)",
    "dialog.codeColumnRequired": "code column (required)",
    "dialog.widthColumnOptional": "width column (optional, leave blank to skip)",
    "dialog.noteColumnOptional": "note column (optional, leave blank to skip)",
    "dialog.optional": "Optional",
    "dialog.required": "required",
    "dialog.defaultUnmarked": "Default unmarked",
    "dialog.requiredForColumn": "Required for Column",
    "dialog.fileNameSource": "file_name source",
    "dialog.none": "None",
    "dialog.column": "Column",
    "dialog.sheetName": "Sheet name",
    "dialog.srtImportHint": "Each subtitle becomes one row. Timecode is imported as title_addr, and subtitle text is imported into both original_text and translated_text.",
    "dialog.excelWorkbook": "Excel Workbook",
    "dialog.srtSubtitle": "SRT Subtitle",
    "dialog.textFile": "Text File",
    "dialog.textTable": "Text table",
    "message.rows": "row(s)",
    "message.excelImported": "Excel imported",
    "message.excelAppended": "Excel appended",
    "message.srtImported": "SRT imported",
    "message.srtAppended": "SRT appended",
    "message.excelExported": "Excel exported",
    "message.srtExported": "SRT exported",
    "message.imported": "Imported",
    "message.appended": "Appended",
    "message.exported": "Exported",
    "message.noRowsToExport": "There are no rows to export.",
    "message.noValidExcelRows": "No valid rows were found in the selected Excel file.",
    "message.noValidSrtRows": "No valid subtitle blocks were found in the selected SRT file.",
    "message.failedImportExcel": "Failed to import Excel file.",
    "message.failedImportSrt": "Failed to import SRT file.",
    "message.failedExportExcel": "Failed to export Excel file.",
    "message.failedExportSrt": "Failed to export SRT file.",
    "message.failedExportTextTable": "Failed to export text table.",
    "message.importOverwrite": "Importing will replace the current list. Continue?",
    "message.encodingImportOverwrite": "Importing will replace the current encoding list. Continue?",
    "message.failedImportTextTable": "Failed to import text table.",
    "message.noMatchingSentenceRows": "No matching Sentence rows.",
    "message.noMatchingEncodingRows": "No matching encoding rows.",
    "message.addEncodingRowsToStart": "Add encoding rows to start.",
    "message.noMatchingCharactersFound": "No matching characters found",
    "message.countedItemsFromRows": "Counted items from rows",
    "message.notCheckedYet": "Not checked yet.",
    "message.clearListConfirm": "Clear the entire list? This cannot be undone.",
    "message.listCleared": "List cleared.",
    "message.deleteSelectedConfirmPrefix": "Delete",
    "message.deleteSelectedConfirmSuffix": "selected row(s)? This cannot be undone.",
    "message.deletedSelected": "Deleted selected rows",
    "message.noRowsSelected": "No rows selected.",
    "message.dialogTaskRunning": "A dialog task is still running.",
    "message.restoredLocalDraft": "Restored local draft.",
    "message.autoSavedLocal": "Auto-saved locally in this App.",
    "message.failedAutoSave": "Failed to auto-save locally.",
    "message.loadedAndAutoSaved": "Loaded and auto-saved.",
    "message.loadedRows": "Loaded",
    "message.jsonSaved": "JSON saved.",
    "message.failedSaveJson": "Failed to save JSON file.",
    "message.failedReadJson": "Failed to read JSON file.",
    "message.jsonRootMustBeArray": "JSON root must be an array.",
    "message.encodingJsonRootMustBeRows": "JSON root must be an array or an object with a rows array.",
    "message.mustBeNumberFromOne": "must be a number from 1.",
    "message.lineDoesNotContainEqualsPrefix": "Line",
    "message.lineDoesNotContainEqualsSuffix": "does not contain \"=\".",
    "message.changedSelectedRowsToPrefix": "Changed selected rows",
    "message.changedSelectedRowsToSuffix": "to",
    "message.importedExcelFileName": "Imported Excel",
    "message.invalidExcelZipCentralDirectory": "Invalid Excel ZIP central directory.",
    "message.invalidExcelZipFile": "Invalid Excel ZIP file.",
    "message.excelDecompressUnavailable": "This platform cannot decompress standard Excel files.",
    "message.excelZipEntryBadDecompress": "Excel ZIP entry did not decompress correctly.",
    "message.excelXmlParseFailed": "Excel XML could not be parsed.",
    "message.undidTableChange": "Undid table change.",
    "message.redidTableChange": "Redid table change.",
    "message.rowAdded": "Row added.",
    "message.noRowsToJump": "There are no rows to jump to.",
    "message.enterRowRangePrefix": "Enter a row number from 1 to",
    "message.enterRowRangeSuffix": ".",
    "message.rowHiddenByFiltersPrefix": "Row",
    "message.rowHiddenByFiltersSuffix": "is hidden by the current filters.",
    "message.jumpedToRow": "Jumped to row",
    "message.characterCountCopied": "Character count result copied.",
    "message.failedCopyCharacterCount": "Failed to copy character count result.",
    "message.clipboardUnavailable": "Clipboard copy is unavailable.",
    "message.translationResultDiscarded": "Translation result discarded.",
    "message.llmSettingsSaved": "LLM server settings saved.",
    "message.llmApiKeySaved": "LLM API key saved.",
    "message.llmApiKeyCleared": "LLM API key cleared.",
    "message.llmSettingsReset": "LLM server settings reset.",
    "message.encodingListCleared": "Encoding list cleared.",
    "ai.title": "AI Translation",
    "ai.subtitle": "Start translation for the selected rows.",
    "ai.rows": "Rows",
    "ai.rowsToTranslate": "Rows to translate",
    "ai.sourceLanguage": "Source language",
    "ai.targetLanguage": "Target language",
    "ai.minimumOriginalCharacters": "Minimum original characters",
    "ai.promptTemplate": "Prompt template",
    "ai.defaultGamePrompt": "Default Prompt for Video Game Translation",
    "ai.defaultVideoPrompt": "Default Prompt for Video Subtitle Translation",
    "ai.timeoutSeconds": "Timeout seconds",
    "ai.temperature": "Temperature",
    "ai.attachmentTxtFile": "Attachment txt file",
    "ai.attachmentPlaceholder": "Optional .txt reference file",
    "ai.viewResult": "View Result",
    "ai.fakeTranslate": "Debug Translation",
    "ai.translate": "Translate",
    "ai.translating": "Translating...",
    "ai.translationResult": "Translation Result",
    "ai.runningTranslation": "Running translation...",
    "ai.total": "Total",
    "ai.done": "Done",
    "ai.pending": "Pending",
    "ai.errors": "Errors",
    "ai.applied": "Applied",
    "ai.original": "Original",
    "ai.translatedPreview": "Translated preview",
    "ai.selectAll": "Select All",
    "ai.applySelected": "Apply Selected",
    "ai.discardResult": "Discard Result",
    "ai.candidate": "Candidate",
    "ai.status": "Status",
    "ai.label": "Label",
    "ai.waitingForRow": "Waiting for the row...",
    "ai.waitingForPreview": "Waiting for preview...",
    "ai.loadingTaskRows": "Loading task rows",
    "ai.setStateToTemp": "Set state to ⭕️temp",
    "ai.appliedToTable": "Applied to table.",
    "ai.noSelectedResultsApplied": "No selected results could be applied.",
    "ai.appliedResults": "Applied translation results",
    "ai.appliedResultsAndTemp": "Applied translation results and set state to ⭕️temp",
    "ai.discardResultConfirm": "Discard the current translation result?",
    "ai.discardResultTitle": "Discard Translation Result",
    "ai.noResultExists": "No translation result exists.",
    "ai.returnedFromResult": "Returned from translation result.",
    "ai.defaultGamePromptRestored": "Default game prompt restored.",
    "ai.defaultVideoPromptRestored": "Default video subtitle prompt restored.",
    "ai.selectTxtAttachmentTitle": "Select AI Translation TXT Attachment",
    "ai.attachmentSelected": "Attachment selected.",
    "ai.attachmentCleared": "Attachment cleared.",
    "ai.replaceResultConfirm": "Starting a new translation run will replace the current result. Continue?",
    "ai.replaceResultTitle": "Replace Translation Result",
    "ai.currentResultKept": "Current translation result was kept.",
    "ai.baseUrlRequired": "Base URL is required. Open LLM Server Settings and fill in Base URL before translation.",
    "ai.modelRequired": "Model is required. Open LLM Server Settings and fill in Model before translation.",
    "ai.failedReadAttachment": "Failed to read attachment file.",
    "ai.startingFakeTranslation": "Starting translation...",
    "ai.startingAiTranslation": "Starting AI translation...",
    "ai.fakeTranslatingRow": "Translating row",
    "ai.translatingRow": "Translating row",
    "ai.stoppedBeforeRow": "Translation stopped before this row.",
    "ai.notTranslated": "Not translated.",
    "ai.noRowsMatchScope": "No rows match the selected translation scope.",
    "ai.translationStopped": "Translation stopped",
    "ai.translationComplete": "Translation complete",
    "ai.failedStartTranslation": "Failed to start AI translation.",
    "ai.waitingForTranslation": "Waiting for translation.",
    "ai.fakeStoppedBeforeRow": "Translation stopped before this row.",
    "ai.simulatedTranslationNote": "Simulated translation: candidate equals original text.",
    "ai.simulatedTranslationComplete": "Simulated translation complete.",
    "ai.requestComplete": "Translation complete.",
    "ai.requestFailed": "Translation request failed.",
    "ai.stoppingTranslation": "Stopping translation...",
    "ai.scope.all": "All rows",
    "ai.scope.selected": "Selected rows",
    "ai.scope.filtered": "Filtered rows",
    "llm.title": "LLM Server Settings",
    "llm.subtitle": "Server options are saved locally. API Key is stored in the system credential store.",
    "llm.serverType": "Server type",
    "llm.localServer": "Local server",
    "llm.cloudServer": "Cloud server",
    "llm.provider": "Provider",
    "llm.baseUrl": "Base URL",
    "llm.model": "Model",
    "llm.apiKey": "API key (You need to paste the value every time you launch the App!)",
    "llm.saveKey": "Save Key",
    "llm.clearKey": "Clear Key",
    "llm.organization": "Organization",
    "llm.project": "Project",
    "llm.extraRequestJson": "Extra request JSON",
    "llm.extraRequestHelp": "Optional JSON object merged into the chat/completions request body. Useful for local model options such as disabling thinking. A single field fragment is also accepted.",
    "llm.testConnection": "Test Connection",
    "llm.testing": "Testing...",
    "llm.timeoutSaved": "Timeout seconds saved.",
    "llm.enterApiKeyBeforeSaving": "Enter an API key before saving.",
    "llm.apiKeySavedCredential": "API key saved in system credential store.",
    "llm.failedSaveApiKey": "Failed to save API key.",
    "llm.apiKeyCleared": "API key cleared.",
    "llm.failedClearApiKey": "Failed to clear API key.",
    "llm.settingsResetApiKeyUnchanged": "LLM server settings reset. API key was not changed.",
    "llm.testingConnection": "Testing connection...",
    "llm.failedTestConnection": "Failed to test LLM connection.",
    "llm.failedReadApiKeyState": "Failed to read API key state.",
    "llm.connectionSucceeded": "Connection succeeded",
    "llm.modelNameNotValidated": "Model name was not validated yet.",
    "llm.providerPlaceholder": "OpenAI compatible, Ollama, LM Studio...",
    "llm.apiKeyPlaceholder": "Optional for local servers",
    "llm.optionalPlaceholder": "Optional",
    "stats.characterCount": "Character Count",
    "stats.run": "Run",
    "stats.copyResult": "Copy Result",
    "stats.result": "Result",
    "stats.scope": "Scope",
    "stats.characterTypes": "Character types",
    "stats.sortOrder": "Sort order",
    "stats.desc": "Descending",
    "stats.asc": "Ascending",
    "stats.ignoreWhitespace": "Ignore whitespace",
    "stats.rows": "Rows",
    "stats.rowsCounted": "Rows counted",
    "stats.allRows": "All rows",
    "stats.filteredRows": "Filtered rows",
    "stats.selectedRows": "Selected rows",
    "stats.sort": "Sort",
    "stats.western": "Western",
    "stats.fullwidth": "Fullwidth punctuation/digits",
    "stats.halfwidth": "Halfwidth punctuation/digits",
    "stats.token": "Token",
    "stats.bracketTokens": "Bracket tokens",
    "stats.cleanup": "Cleanup",
    "stats.running": "Running",
    "stats.notCountedYet": "Not counted yet.",
    "stats.countingCharacters": "Counting characters...",
    "stats.checkingUnmappedCharacters": "Checking unmapped characters...",
    "stats.checkingUnusedEncodings": "Checking unused encodings...",
    "stats.noUnmappedCharactersFound": "No unmapped characters found",
    "stats.foundUnmappedCharacters": "Found unmapped items",
    "stats.occurrences": "Occurrences",
    "stats.noUnusedEncodingsFound": "No unused encodings found",
    "stats.foundUnusedEncodings": "Found unused encodings",
    "stats.unmappedCharacterResultCopied": "Unmapped character result copied.",
    "stats.failedCopyUnmappedCharacterResult": "Failed to copy unmapped character result.",
    "stats.unusedEncodingResultCopied": "Unused encoding result copied.",
    "stats.failedCopyUnusedEncodingResult": "Failed to copy unused encoding result.",
    "stats.checkingLineLength": "Checking line length...",
    "stats.noOverlongNaturalLinesFound": "No overlong natural lines found",
    "stats.foundOverlongNaturalLines": "Found overlong natural lines",
    "stats.lineLengthResultCopied": "Line length result copied.",
    "stats.failedCopyLineLengthResult": "Failed to copy line length result.",
    "stats.unmappedCharacters": "Unmapped Characters",
    "stats.unusedEncodings": "Unused Encodings",
    "stats.textRowsScanned": "Text rows scanned",
    "lineLength.title": "Line Length Check",
    "lineLength.maxLength": "Max length",
    "lineLength.widthRules": "Width rules",
    "lineLength.type": "Type",
    "lineLength.source": "Source",
    "lineLength.fixedFallback": "Fixed / fallback",
    "lineLength.encodingWidth": "Encoding width",
    "lineLength.fixedValue": "Fixed value",
    "lineLength.other": "Others",
    "lineLength.help": "Encoding width uses the width value from the Encoding Manager char table. Fixed value always uses the number below. When Encoding width is selected, the same number is used as the fallback if a token is missing from the table or has no valid width.",
    "bulk.title": "Change Selected State",
    "bulk.state": "State",
    "bulk.selectedRows": "Selected rows",
  },
  "zh-Hans": {
    "app.language": "语言",
    "common.add": "添加",
    "common.all": "全部",
    "common.browse": "浏览",
    "common.cancel": "取消",
    "common.clear": "清除",
    "common.close": "关闭",
    "common.delete": "删除",
    "common.done": "完成",
    "common.apply": "应用",
    "common.stop": "停止",
    "common.stopping": "停止中...",
    "common.export": "导出",
    "common.import": "导入",
    "common.importing": "导入中...",
    "common.check": "检查",
    "common.path": "路径",
    "common.ready": "就绪。",
    "common.reset": "重置",
    "common.save": "保存",
    "common.saving": "保存中...",
    "common.searchText": "搜索文本...",
    "common.selected": "已选择",
    "common.theme": "主题",
    "menu.file": "文件",
    "menu.tools": "工具",
    "menu.statistics": "统计",
    "theme.system": "跟随系统",
    "theme.light": "浅色",
    "theme.dark": "深色",
    "match.contains": "包含",
    "match.exact": "完全匹配",
    "font.default": "默认",
    "font.sc": "简体中文",
    "font.tc": "繁体中文",
    "font.jp": "日语",
    "font.kr": "韩语",
    "main.readJson": "读取 JSON",
    "main.saveJson": "保存 JSON",
    "main.saveJsonAs": "JSON 另存为",
    "main.importExcel": "导入 Excel",
    "main.exportExcel": "导出 Excel",
    "main.clearList": "清空列表",
    "main.deleteSelected": "删除选中",
    "main.noJsonFileLoaded": "未读取 JSON 文件",
    "main.noJsonSavePath": "尚未选择 JSON 保存路径",
    "main.caseSensitive": "区分大小写",
    "main.length": "长度",
    "main.min": "最小",
    "main.max": "最大",
    "main.to": "到",
    "main.statusFilters": "状态过滤",
    "main.rows": "行",
    "main.goToRow": "跳转到行",
    "main.go": "跳转",
    "main.font": "字体",
    "main.addRowAtEnd": "在末尾添加行",
    "main.selectFilteredRows": "选择过滤结果",
    "main.sentenceList": "文本列表",
    "main.originalEqualsTranslated": "原文 == 译文",
    "main.originalNotEqualsTranslated": "原文 != 译文",
    "main.emptyTranslation": "空译文",
    "main.hasNote": "有 note",
    "main.duplicateTitleAddr": "重复 title_addr",
    "encoding.title": "码表管理器",
    "encoding.character": "字符",
    "encoding.note": "Note",
    "encoding.readJson": "读取 JSON",
    "encoding.saveJson": "保存 JSON",
    "encoding.importTbl": "导入 TBL",
    "encoding.exportTbl": "导出 TBL",
    "encoding.importExcel": "导入 Excel",
    "encoding.exportExcel": "导出 Excel",
    "encoding.encodingList": "码表列表",
    "encoding.duplicateCharacter": "重复字符",
    "encoding.duplicateCode": "重复编码",
    "encoding.emptyCharacter": "空白字符",
    "encoding.emptyCode": "空白编码",
    "encoding.punctuation": "标点",
    "encoding.han": "汉字",
    "encoding.kana": "假名",
    "encoding.hangul": "韩文",
    "encoding.latin": "西文",
    "encoding.special": "特殊字符",
    "dialog.importExcel": "导入 Excel",
    "dialog.exportExcel": "导出 Excel",
    "dialog.importSrt": "导入 SRT",
    "dialog.exportSrt": "导出 SRT",
    "dialog.importTbl": "导入文本码表",
    "dialog.exportTbl": "导出文本码表",
    "dialog.startRow": "起始行",
    "dialog.outputEncoding": "输出编码",
    "dialog.filteredOnly": "只导出当前过滤结果",
    "dialog.appendRows": "追加到列表末尾",
    "dialog.keepRowNumber": "保留行号列",
    "dialog.splitByFileName": "按 file_name 分 sheet",
    "dialog.dualLanguageSrt": "双语字幕：translated_text + original_text",
    "dialog.rowsColumnsStartAtOne": "行号和列号都从 1 开始，符合 Excel 习惯。",
    "dialog.lineFormat": "行格式",
    "dialog.encoding": "编码",
    "dialog.autoDetect": "自动检测",
    "dialog.extension": "扩展名",
    "dialog.newline": "换行符",
    "dialog.exportTblWarning": "只导出 char 和 code。width 与 note 不会保存。",
    "dialog.charColumnRequired": "char 列（必填）",
    "dialog.codeColumnRequired": "code 列（必填）",
    "dialog.widthColumnOptional": "width 列（可选，留空跳过）",
    "dialog.noteColumnOptional": "note 列（可选，留空跳过）",
    "dialog.optional": "可选",
    "dialog.required": "必填",
    "dialog.defaultUnmarked": "默认 unmarked",
    "dialog.requiredForColumn": "Column 模式必填",
    "dialog.fileNameSource": "file_name 来源",
    "dialog.none": "无",
    "dialog.column": "列",
    "dialog.sheetName": "Sheet 名称",
    "dialog.srtImportHint": "每条字幕会导入为一行。时间轴会导入到 title_addr，字幕文本会同时导入到 original_text 和 translated_text。",
    "dialog.excelWorkbook": "Excel 工作簿",
    "dialog.srtSubtitle": "SRT 字幕",
    "dialog.textFile": "文本文件",
    "dialog.textTable": "文本码表",
    "message.rows": "行",
    "message.excelImported": "Excel 已导入",
    "message.excelAppended": "Excel 已追加",
    "message.srtImported": "SRT 已导入",
    "message.srtAppended": "SRT 已追加",
    "message.excelExported": "Excel 已导出",
    "message.srtExported": "SRT 已导出",
    "message.imported": "已导入",
    "message.appended": "已追加",
    "message.exported": "已导出",
    "message.noRowsToExport": "没有可以导出的行。",
    "message.noValidExcelRows": "选中的 Excel 文件里没有找到有效行。",
    "message.noValidSrtRows": "选中的 SRT 文件里没有找到有效字幕块。",
    "message.failedImportExcel": "导入 Excel 文件失败。",
    "message.failedImportSrt": "导入 SRT 文件失败。",
    "message.failedExportExcel": "导出 Excel 文件失败。",
    "message.failedExportSrt": "导出 SRT 文件失败。",
    "message.failedExportTextTable": "导出文本码表失败。",
    "message.importOverwrite": "导入会替换当前列表。是否继续？",
    "message.encodingImportOverwrite": "导入会替换当前码表列表。是否继续？",
    "message.failedImportTextTable": "导入文本码表失败。",
    "message.noMatchingSentenceRows": "没有匹配的 Sentence 行。",
    "message.noMatchingEncodingRows": "没有匹配的码表行。",
    "message.addEncodingRowsToStart": "添加码表行后开始。",
    "message.noMatchingCharactersFound": "没有找到匹配字符",
    "message.countedItemsFromRows": "已统计项目，来源行数",
    "message.notCheckedYet": "尚未检查。",
    "message.clearListConfirm": "清空整个列表？这个操作不能撤销。",
    "message.listCleared": "列表已清空。",
    "message.deleteSelectedConfirmPrefix": "删除",
    "message.deleteSelectedConfirmSuffix": "个选中行？这个操作不能撤销。",
    "message.deletedSelected": "已删除选中行",
    "message.noRowsSelected": "没有选中行。",
    "message.dialogTaskRunning": "有一个弹窗任务仍在运行。",
    "message.restoredLocalDraft": "已恢复本地草稿。",
    "message.autoSavedLocal": "已在本 App 内自动保存。",
    "message.failedAutoSave": "本地自动保存失败。",
    "message.loadedAndAutoSaved": "已读取并自动保存。",
    "message.loadedRows": "已读取",
    "message.jsonSaved": "JSON 已保存。",
    "message.failedSaveJson": "保存 JSON 文件失败。",
    "message.failedReadJson": "读取 JSON 文件失败。",
    "message.jsonRootMustBeArray": "JSON 根节点必须是数组。",
    "message.encodingJsonRootMustBeRows": "JSON 根节点必须是数组，或包含 rows 数组的对象。",
    "message.mustBeNumberFromOne": "必须是从 1 开始的数字。",
    "message.lineDoesNotContainEqualsPrefix": "第",
    "message.lineDoesNotContainEqualsSuffix": "行不包含 \"=\"。",
    "message.changedSelectedRowsToPrefix": "已修改选中行",
    "message.changedSelectedRowsToSuffix": "为",
    "message.importedExcelFileName": "导入的 Excel",
    "message.invalidExcelZipCentralDirectory": "Excel ZIP 中央目录无效。",
    "message.invalidExcelZipFile": "Excel ZIP 文件无效。",
    "message.excelDecompressUnavailable": "当前平台无法解压标准 Excel 文件。",
    "message.excelZipEntryBadDecompress": "Excel ZIP 条目解压结果不正确。",
    "message.excelXmlParseFailed": "无法解析 Excel XML。",
    "message.undidTableChange": "已撤销表格修改。",
    "message.redidTableChange": "已重做表格修改。",
    "message.rowAdded": "已添加行。",
    "message.noRowsToJump": "没有可以跳转的行。",
    "message.enterRowRangePrefix": "请输入 1 到",
    "message.enterRowRangeSuffix": "之间的行号。",
    "message.rowHiddenByFiltersPrefix": "第",
    "message.rowHiddenByFiltersSuffix": "行被当前筛选条件隐藏。",
    "message.jumpedToRow": "已跳转到第",
    "message.characterCountCopied": "字符统计结果已复制。",
    "message.failedCopyCharacterCount": "复制字符统计结果失败。",
    "message.clipboardUnavailable": "剪贴板复制不可用。",
    "message.translationResultDiscarded": "翻译结果已丢弃。",
    "message.llmSettingsSaved": "LLM 服务器设置已保存。",
    "message.llmApiKeySaved": "LLM API Key 已保存。",
    "message.llmApiKeyCleared": "LLM API Key 已清除。",
    "message.llmSettingsReset": "LLM 服务器设置已重置。",
    "message.encodingListCleared": "码表列表已清空。",
    "ai.title": "AI 翻译",
    "ai.subtitle": "对指定行启动翻译。",
    "ai.rows": "行范围",
    "ai.rowsToTranslate": "将翻译行数",
    "ai.sourceLanguage": "源语言",
    "ai.targetLanguage": "目标语言",
    "ai.minimumOriginalCharacters": "原文最少字符数",
    "ai.promptTemplate": "提示词模板",
    "ai.defaultGamePrompt": "默认游戏翻译提示词",
    "ai.defaultVideoPrompt": "默认视频字幕翻译提示词",
    "ai.timeoutSeconds": "超时时间秒数",
    "ai.temperature": "Temperature",
    "ai.attachmentTxtFile": "附加 txt 文件",
    "ai.attachmentPlaceholder": "可选 .txt 参考文件",
    "ai.viewResult": "查看结果",
    "ai.fakeTranslate": "Debug 翻译",
    "ai.translate": "翻译",
    "ai.translating": "翻译中...",
    "ai.translationResult": "翻译结果",
    "ai.runningTranslation": "正在翻译...",
    "ai.total": "总数",
    "ai.done": "完成",
    "ai.pending": "待处理",
    "ai.errors": "错误",
    "ai.applied": "已应用",
    "ai.original": "原文",
    "ai.translatedPreview": "译文预览",
    "ai.selectAll": "全选",
    "ai.applySelected": "应用选中",
    "ai.discardResult": "丢弃结果",
    "ai.candidate": "候选译文",
    "ai.status": "状态",
    "ai.label": "标签",
    "ai.waitingForRow": "等待当前行...",
    "ai.waitingForPreview": "等待译文预览...",
    "ai.loadingTaskRows": "正在加载任务行",
    "ai.setStateToTemp": "将状态设为 ⭕️temp",
    "ai.appliedToTable": "已应用到表格。",
    "ai.noSelectedResultsApplied": "没有可应用的选中结果。",
    "ai.appliedResults": "已应用翻译结果",
    "ai.appliedResultsAndTemp": "已应用翻译结果，并将状态设为 ⭕️temp",
    "ai.discardResultConfirm": "丢弃当前翻译结果？",
    "ai.discardResultTitle": "丢弃翻译结果",
    "ai.noResultExists": "当前没有翻译结果。",
    "ai.returnedFromResult": "已从翻译结果返回。",
    "ai.defaultGamePromptRestored": "已恢复默认游戏提示词。",
    "ai.defaultVideoPromptRestored": "已恢复默认视频字幕提示词。",
    "ai.selectTxtAttachmentTitle": "选择 AI 翻译 TXT 附加文件",
    "ai.attachmentSelected": "已选择附加文件。",
    "ai.attachmentCleared": "已清除附加文件。",
    "ai.replaceResultConfirm": "开始新的翻译会替换当前结果。是否继续？",
    "ai.replaceResultTitle": "替换翻译结果",
    "ai.currentResultKept": "已保留当前翻译结果。",
    "ai.baseUrlRequired": "需要填写 Base URL。请先打开 LLM 服务器设置并填写 Base URL。",
    "ai.modelRequired": "需要填写模型。请先打开 LLM 服务器设置并填写 Model。",
    "ai.failedReadAttachment": "读取附加文件失败。",
    "ai.startingFakeTranslation": "正在启动翻译...",
    "ai.startingAiTranslation": "正在启动 AI 翻译...",
    "ai.fakeTranslatingRow": "正在翻译第",
    "ai.translatingRow": "正在翻译第",
    "ai.stoppedBeforeRow": "翻译在这一行之前停止。",
    "ai.notTranslated": "未翻译。",
    "ai.noRowsMatchScope": "没有符合当前翻译范围的行。",
    "ai.translationStopped": "翻译已停止",
    "ai.translationComplete": "翻译完成",
    "ai.failedStartTranslation": "启动 AI 翻译失败。",
    "ai.waitingForTranslation": "等待翻译。",
    "ai.fakeStoppedBeforeRow": "翻译在这一行之前停止。",
    "ai.simulatedTranslationNote": "模拟翻译：候选译文等于原文。",
    "ai.simulatedTranslationComplete": "模拟翻译完成。",
    "ai.requestComplete": "翻译完成。",
    "ai.requestFailed": "翻译请求失败。",
    "ai.stoppingTranslation": "正在停止翻译...",
    "ai.scope.all": "全部行",
    "ai.scope.selected": "选中行",
    "ai.scope.filtered": "过滤行",
    "llm.title": "LLM 服务器设置",
    "llm.subtitle": "服务器设置保存在本地。API Key 保存在系统凭据存储中。",
    "llm.serverType": "服务器类型",
    "llm.localServer": "本地服务器",
    "llm.cloudServer": "云端服务器",
    "llm.provider": "服务商",
    "llm.baseUrl": "Base URL",
    "llm.model": "模型",
    "llm.apiKey": "API Key（每次启动 App 后都需要重新粘贴！）",
    "llm.saveKey": "保存 Key",
    "llm.clearKey": "清除 Key",
    "llm.organization": "Organization",
    "llm.project": "Project",
    "llm.extraRequestJson": "额外请求 JSON",
    "llm.extraRequestHelp": "可选 JSON object，会合并进 chat/completions 请求 body。可用于本地模型参数，比如关闭 thinking。也可以只填写单个字段片段。",
    "llm.testConnection": "测试连接",
    "llm.testing": "测试中...",
    "llm.timeoutSaved": "超时时间已保存。",
    "llm.enterApiKeyBeforeSaving": "保存前请输入 API Key。",
    "llm.apiKeySavedCredential": "API Key 已保存到系统凭据存储。",
    "llm.failedSaveApiKey": "保存 API Key 失败。",
    "llm.apiKeyCleared": "API Key 已清除。",
    "llm.failedClearApiKey": "清除 API Key 失败。",
    "llm.settingsResetApiKeyUnchanged": "LLM 服务器设置已重置。API Key 未改变。",
    "llm.testingConnection": "正在测试连接...",
    "llm.failedTestConnection": "测试 LLM 连接失败。",
    "llm.failedReadApiKeyState": "读取 API Key 状态失败。",
    "llm.connectionSucceeded": "连接成功",
    "llm.modelNameNotValidated": "模型名称尚未验证。",
    "llm.providerPlaceholder": "OpenAI 兼容、Ollama、LM Studio...",
    "llm.apiKeyPlaceholder": "本地服务器可不填",
    "llm.optionalPlaceholder": "可选",
    "stats.characterCount": "字符统计",
    "stats.run": "运行",
    "stats.copyResult": "复制结果",
    "stats.result": "结果",
    "stats.scope": "范围",
    "stats.characterTypes": "字符类型",
    "stats.sortOrder": "排序",
    "stats.desc": "降序",
    "stats.asc": "升序",
    "stats.ignoreWhitespace": "忽略空白字符",
    "stats.rows": "行",
    "stats.rowsCounted": "统计行数",
    "stats.allRows": "全部行",
    "stats.filteredRows": "过滤行",
    "stats.selectedRows": "选中行",
    "stats.sort": "排序",
    "stats.western": "西文",
    "stats.fullwidth": "全角标点/数字",
    "stats.halfwidth": "半角标点/数字",
    "stats.token": "Token",
    "stats.bracketTokens": "括号 Token",
    "stats.cleanup": "清理",
    "stats.running": "运行中",
    "stats.notCountedYet": "尚未统计。",
    "stats.countingCharacters": "正在统计字符...",
    "stats.checkingUnmappedCharacters": "正在检查未映射字符...",
    "stats.checkingUnusedEncodings": "正在检查未使用编码...",
    "stats.noUnmappedCharactersFound": "没有找到未映射字符",
    "stats.foundUnmappedCharacters": "找到未映射项目",
    "stats.occurrences": "出现次数",
    "stats.noUnusedEncodingsFound": "没有找到未使用编码",
    "stats.foundUnusedEncodings": "找到未使用编码",
    "stats.unmappedCharacterResultCopied": "未映射字符结果已复制。",
    "stats.failedCopyUnmappedCharacterResult": "复制未映射字符结果失败。",
    "stats.unusedEncodingResultCopied": "未使用编码结果已复制。",
    "stats.failedCopyUnusedEncodingResult": "复制未使用编码结果失败。",
    "stats.checkingLineLength": "正在检查自然行长度...",
    "stats.noOverlongNaturalLinesFound": "没有找到超长自然行",
    "stats.foundOverlongNaturalLines": "找到超长自然行",
    "stats.lineLengthResultCopied": "自然行长度检查结果已复制。",
    "stats.failedCopyLineLengthResult": "复制自然行长度检查结果失败。",
    "stats.unmappedCharacters": "未映射字符",
    "stats.unusedEncodings": "未使用编码",
    "stats.textRowsScanned": "扫描文本行数",
    "lineLength.title": "自然行长度检查",
    "lineLength.maxLength": "最大长度",
    "lineLength.widthRules": "宽度规则",
    "lineLength.type": "类型",
    "lineLength.source": "来源",
    "lineLength.fixedFallback": "固定值 / fallback",
    "lineLength.encodingWidth": "Encoding width",
    "lineLength.fixedValue": "固定值",
    "lineLength.other": "其他",
    "lineLength.help": "Encoding width 会使用码表管理器里该字符的 width。Fixed value 会始终使用下面填写的数字。选择 Encoding width 时，如果 token 在码表中不存在或没有有效 width，同一个数字会作为 fallback 使用。",
    "bulk.title": "批量修改状态",
    "bulk.state": "状态",
    "bulk.selectedRows": "选中行数",
  },
};

export const currentLanguage = ref<AppLanguage>(restoreAppLanguage());

export function setAppLanguage(language: AppLanguage) {
  currentLanguage.value = language;
  window.localStorage.setItem(appLanguageStorageKey, language);
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === "zh-Hans" ? "zh-Hans" : "en";
}

export function t(key: TranslationKey) {
  return translations[currentLanguage.value][key] ?? translations.en[key] ?? key;
}

function restoreAppLanguage(): AppLanguage {
  try {
    return normalizeAppLanguage(window.localStorage.getItem(appLanguageStorageKey));
  } catch {
    return "en";
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === appLanguageStorageKey && event.newValue) {
    currentLanguage.value = normalizeAppLanguage(event.newValue);
  }
});
