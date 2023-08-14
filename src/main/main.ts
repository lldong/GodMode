/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import Store from 'electron-store';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

let store = new Store();

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});
ipcMain.on('electron-store-get', async (event, val, def) => {
  event.returnValue = store.get(val, def);
});
ipcMain.on('electron-store-set', async (event, property, val) => {
  store.set(property, val);
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      webviewTag: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


app.on('web-contents-created', (e, contents) => {
  if (contents.getType() == 'webview') {
    // contents.on("will-navigate", (event, url, frameName, disposition, options, additionalFeatures) => {
    //   console.log({frameName})
    //   if (frameName === 'my_popup') {
    //     // Open `url` in a new window...
    //     event.preventDefault()
    //     Object.assign(options, {
    //       parent: win,
    //       width: 500,
    //       height: 400
    //     })
    //     event.newGuest = new BrowserWindow(options)
    //   }
    // })
    // open link with external browser in webview
    contents.setWindowOpenHandler('new-window', (e, url) => {
      e.preventDefault();
      shell.openExternal(url);
    });
    // // set context menu in webview
    // contextMenu({
    //   window: contents,
    // });

    // we can't set the native app menu with "menubar" so need to manually register these events
    // register cmd+c/cmd+v events
    contents.on('before-input-event', (event, input) => {
      const { control, meta, key } = input;
      if (!control && !meta) return;
      if (key === 'c') contents.copy();
      if (key === 'x') contents.cut();
      // if (key === "v") contents.paste(); // we will handle this manually
      if (key === 'a') contents.selectAll();
      if (key === 'z') contents.undo();
      if (key === 'y') contents.redo();
      if (key === 'q') app.quit();
      if (key === 'r') contents.reload();
      if (key === 'h') contents.goBack();
      if (key === 'l') contents.goForward();
    });
  }
  // // we can't set the native app menu with "menubar" so need to manually register these events
  // // register cmd+c/cmd+v events
  // contents.on('before-input-event', (event, input) => {
  //   const { control, meta, key } = input;
  //   if (!control && !meta) return;
  //   if (key === 'c') contents.copy();
  //   if (key === 'v') contents.paste();
  //   if (key === 'x') contents.cut();
  //   if (key === 'a') contents.selectAll();
  //   if (key === 'z') contents.undo();
  //   if (key === 'y') contents.redo();
  //   if (key === 'q') app.quit();
  //   if (key === 'r') contents.reload();
  //   if (key === 'h') contents.goBack();
  //   if (key === 'l') contents.goForward();
  // });
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
