/**
 * La huella (runtime version) decide a qué APK instalado le llega cada actualización OTA.
 *
 * Se agregan a las exclusiones por defecto de Expo los .gitignore: sus finales de línea
 * cambian entre Windows (CRLF) y Linux (LF), y hacían que la misma app diera huellas
 * distintas según desde dónde se publicara. No afectan el código nativo.
 *
 * Importante: hay que SUMAR a DEFAULT_SOURCE_SKIPS. Reemplazarlo hace que la huella cambie
 * después del prebuild en EAS (scripts de package.json) y la compilación falla.
 */
const { DEFAULT_SOURCE_SKIPS, SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: DEFAULT_SOURCE_SKIPS | SourceSkips.GitIgnore,
};
