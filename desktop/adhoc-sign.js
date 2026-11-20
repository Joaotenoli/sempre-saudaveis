// Sem certificado da Apple, assina o app "ad-hoc". Assim o Mac mostra
// "não foi possível verificar" (dá para abrir em Ajustes) em vez de "está danificado".
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
