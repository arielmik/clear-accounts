/**
 * La huella (runtime version) decide a qué APK instalado le llega cada actualización OTA.
 * Se ignoran los .gitignore: sus finales de línea cambian entre Windows (CRLF) y Linux (LF)
 * y hacían que la misma app diera huellas distintas según desde dónde se publicara.
 * Los .gitignore no afectan el código nativo, así que ignorarlos es seguro.
 */
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.GitIgnore,
};
