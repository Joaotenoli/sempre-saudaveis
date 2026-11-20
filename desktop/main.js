// Sempre Saudáveis para Mac e Windows: uma janela própria que abre o app publicado.
// O app guarda os dados offline e sincroniza pela conta, então a versão nova chega sozinha.
const { app, BrowserWindow, shell, Menu } = require("electron");

const APP_URL = "https://joaotenoli.github.io/sempre-saudaveis/app/";
const ORIGIN = new URL(APP_URL).origin;

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

const offlinePage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#F2F4EE;color:#131A14;font-family:-apple-system,Segoe UI,sans-serif;text-align:center">
<div><h1 style="font-size:22px;margin:0 0 8px">Sem conexão</h1><p style="color:#5F6B60;margin:0 0 18px">Na primeira vez o app precisa de internet. Depois ele funciona offline.</p>
<button onclick="location.href='${APP_URL}'" style="border:0;border-radius:12px;padding:12px 20px;background:#10240F;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Tentar de novo</button></div></body></html>`)}`;

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 840, minWidth: 380, minHeight: 600,
    title: "Sempre Saudáveis", backgroundColor: "#F2F4EE", show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once("ready-to-show", () => win.show());

  // Links para fora do app abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("data:")) return;
    if (new URL(url).origin !== ORIGIN) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && !String(url).startsWith("data:")) win.loadURL(offlinePage);
  });

  win.loadURL(APP_URL);
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: "appMenu" }, { role: "editMenu" },
      { label: "Ver", submenu: [{ role: "reload", label: "Recarregar" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
      { role: "windowMenu" }
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
