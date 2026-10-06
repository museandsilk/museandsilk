/**
 * The Excel library is a plain static file (copied from node_modules by scripts/copy-vendor.mjs). Its name carries the
 * version, so the browser may keep it forever (public/_headers marks /vendor/* immutable) and a new version simply
 * gets a new name. Keep the version in step with the installed "exceljs" package – the copy script warns if it drifts.
 */
export const EXCELJS_VERSION = "4.4.0";
export const EXCELJS_URL = `/vendor/exceljs-${EXCELJS_VERSION}.min.js`;
