// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals, dialog = open os's windows, shell = shell of the computer
const { app, BrowserWindow, ipcMain, dialog, shell, screen, desktopCapturer } = require('electron'); //library to use electron
const path = require('path');   //library to use paths
const fs = require('fs');   //library to use file system
const mammoth = require('mammoth'); //library to read word files

let mainWindow;     // main window with all features
let notesWindow;    // window with DM's notes
let manualsWindow;  // window with manuals directory
let playerWindow;   // window with the players' screen
let playerControllerWindow; //window for the control of the players' screen
let initiativeWindow;   //window to managing initiative
let musicPlayerWindow;  //window to play music

let currentFilePath = null; // file word's path
let currentDirectoryPath = null;    //manuals directory's path
let fileWatcher = null;     // watcher to save the word file
let reloadTimeout = null;

let savedSeason = null; //saved season to remember it
let savedSession = null;    //saved session to remember it

let pendingPdfToLoad = null;    // PDF to load

let currentBgImage = null;  //background image for second screen
let currentFgImage = null;  //added element in second screen
let isBlackoutActive = false;  //if there's the blackout window

let currentInitiativeData = {list: [], round: 1, activeIndex: 0, isVisible: false }; //to keep initiative
let isInitiativeVisibleOnScreen = false;    //if there's the initiative window

let currentMusicFolderPath = null;  //music folder's path

const sessionFilePath = path.join(__dirname, 'session.json');
const initiativeFilePath = path.join(__dirname, 'initiative.json');

//----------------------------------------------------------------------------

// ---------------------------------------- MAIN WINDOW -------------------------------------------------

function createWindow() {

    mainWindow = new BrowserWindow({    // main bar with buttons
        x: 480,
        y: 0,
        width: 700,
        height: 580,
        resizable: true,
        title: "DM-CTRLPanel",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');  //loading the main html file bar

    // realoading saved session
    if (fs.existsSync(sessionFilePath)) {
        try {
            const rawData = fs.readFileSync(sessionFilePath, 'utf-8');
            const data = JSON.parse(rawData);

            if(data.savedSeason) savedSeason = data.savedSeason;
            if(data.savedSession) savedSession = data.savedSession;

            if (data.wordFilePath && fs.existsSync(data.wordFilePath)) {
                currentFilePath = data.wordFilePath;
                startWatchingFile(currentFilePath);
                console.log("Reloading last word file:", currentFilePath);

                // if teh notes window was closed, reopen it
                if (data.notesWindowOpen) {
                    notesWindow = new BrowserWindow({
                        x: 0,
                        y: 0,
                        width: 480,
                        height: 520,
                        title: "DM's Notes",
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false
                        }
                    });
                    notesWindow.loadFile('notes.html');
                }
            }

            if (data.manualsFolderPath && fs.existsSync(data.manualsFolderPath)) {
                currentDirectoryPath = data.manualsFolderPath;
                console.log("Reloading last manuals directory: ", currentDirectoryPath);

                if(data.manualsDirectoryOpen) {
                    manualsWindow = new BrowserWindow({ //making the manuals window
                        x: 1090,
                        y: 10,
                        width: 450,
                        height: 500,
                        title: "Manuals",
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false
                        }
                    });

                    manualsWindow.loadFile('manuals.html');
                }
            }

            if (data.bgImage && fs.existsSync(data.bgImage)) {
                currentBgImage = data.bgImage;
            }

        } catch (err) {
            console.error("ERROR: not reloaded session: ", err);
        }
    }
}

app.whenReady().then(createWindow); //making window when the app is ready

app.on('window-all-closed', () => {
    if (fileWatcher) fileWatcher.close();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ---------------------------------------- MANAGE WORD FILE -------------------------------------------------

async function loadAndSendWordFile(filePath) {
    try {
        const { value: html } = await mammoth.convertToHtml({ path: filePath });

        if (notesWindow && !notesWindow.isDestroyed()) {
            notesWindow.webContents.send('init-notes-html', {
                html: html,
                savedSeason: savedSeason,
                savedSession: savedSession
            });
        }
    } catch (err) {
        console.log('Retrying to read file...');
    }
}

async function startWatchingFile(filePath) {
    if (fileWatcher) fileWatcher.close();

    fileWatcher = fs.watch(filePath, (eventType) => {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
            console.log("Updated Word file! Reloading notes...");
            loadAndSendWordFile(filePath);
        }, 400);
    });
}

// ---------------------------------------- IPC NOTES -------------------------------------------------

ipcMain.on('open-notes-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select the file of the campaign...',
        filters: [{ name: "Word Document", extensions: ['docx'] }],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) return;

    currentFilePath = result.filePaths[0];

    if (!notesWindow || notesWindow.isDestroyed()) {
        notesWindow = new BrowserWindow({
            x: 0,
            y: 0,
            width: 460,
            height: 510,
            title: "DM's Notes",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        notesWindow.loadFile('notes.html');
        attachWindowDropDetection(notesWindow, 'Notes');
    } else {
        notesWindow.focus();
    }

    startWatchingFile(currentFilePath);
});

ipcMain.on('notes-window-ready', async () => {
    if (currentFilePath) {
        await loadAndSendWordFile(currentFilePath);
    }
});

ipcMain.on('open-in-word', () => {
    if (currentFilePath) {
        shell.openPath(currentFilePath);
    }
});

ipcMain.on('save-notes-selection', (event, selection) => {
    if (selection) {
        savedSeason = selection.season;
        savedSession = selection.session;
    }
});

// ---------------------------------------- MANAGE MANUALS FOLDER -------------------------------------------------

function sendManualsList(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return;

    try {
        const files = fs.readdirSync(folderPath);
        const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

        if(manualsWindow && !manualsWindow.isDestroyed()) {
            manualsWindow.webContents.send('init-manuals-list', {
                folderPath: folderPath,
                files: pdfFiles
            });
        }
    } catch (err) {
        console.error("ERROR: manuals directory not found: ", err);
    }
}

async function pickManualsFolder() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select the manuals directory",
        properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) return false;
    currentDirectoryPath = result.filePaths[0];
    return true;
}

function createOrFocusManualsWindow () {
    if (!manualsWindow || manualsWindow.isDestroyed()) {
        manualsWindow = new BrowserWindow({ //making the manuals window
            x: 1180,
            y: 0,
            width: 740,
            height: 1040,
            title: "Manuals",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        manualsWindow.loadFile('manuals.html');
    } else {
        manualsWindow.focus();
        sendManualsList(currentDirectoryPath);
    }
}

// ---------------------------------------- IPC MANUALS -------------------------------------------------

ipcMain.on('open-manuals-dialog', async () => { //asking to the user to select a directory
    if (!currentDirectoryPath) {
        const picked = await pickManualsFolder();
        if (!picked) return;
    }
    createOrFocusManualsWindow();
});

ipcMain.on('change-manuals-folder', async () => {
    const picked = await pickManualsFolder();
    if (picked) {
        sendManualsList(currentDirectoryPath);
    }
});

ipcMain.on('manuals-window-ready', () => {  //when window is ready
    if (currentDirectoryPath) {
        sendManualsList(currentDirectoryPath);
    }
});

ipcMain.on('open-pdf-file', (event, fileName) => {
    if(currentDirectoryPath && fileName) {
        const fullPdfPath = path.join(currentDirectoryPath, fileName);  //making the path of the pdf file
        shell.openPath(fullPdfPath);
    }
})

// ---------------------------------------- MANAGING BOOKMARKS -------------------------------------------------

let pdfViewerWindow = null;
const bookMarksFilePath = path.join(__dirname, 'bookmarks.json');   //making the new file to save bookmarks

function loadBookmarks () { // loading saved bookmarks
    if(!fs.existsSync(bookMarksFilePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(bookMarksFilePath, 'utf-8'));
    } catch (err) {
        return {};
    }
}

function saveBookMarks (data) { //adding bookmarks to the saved file
    fs.writeFileSync(bookMarksFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------- IPC VIEWER -------------------------------------------------

ipcMain.on('open-pdf-viewer', (event, { filePath, page }) => {
    const targetPage = page || 1;

    pendingPdfToLoad = { filePath: filePath, page: targetPage};

    if (!pdfViewerWindow || pdfViewerWindow.isDestroyed()) {
        pdfViewerWindow = new BrowserWindow({
            x: 310,
            y: 50,
            alwaysOnTop: true,
            width: 1300,
            height: 950,
            title:"PDF Viewer",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        pdfViewerWindow.loadFile('pdf-viewer.html');

    } else {
        pdfViewerWindow.focus();
        pdfViewerWindow.webContents.send('load-pdf', {filePath: filePath, page: targetPage});
    }
});

ipcMain.on('pdf-viewer-ready', () => {
    if (pendingPdfToLoad && pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
        pdfViewerWindow.webContents.send('load-pdf', pendingPdfToLoad);
        pendingPdfToLoad = null;
    }
});

ipcMain.handle('get-bookmarks', (event, filePath) => {
    const all = loadBookmarks();
    return all[filePath] || [];
});

ipcMain.handle('add-bookmark', (event, {filePath, name, page}) => { //adding a bookmark and signalizing it to the window to refresh
    const all = loadBookmarks();
    if(!all[filePath]) all[filePath] = [];
    all[filePath].push({id: Date.now().toString(), name, page});
    all[filePath].sort((a, b) => a.page - b.page);
    saveBookMarks(all);
    const update = all[filePath];

    if (manualsWindow && !manualsWindow.isDestroyed() && event.sender !== manualsWindow.webContents)
        manualsWindow.webContents.send('bookmarks-update', { filePath, bookmarks: update});
    if (pdfViewerWindow && !pdfViewerWindow.isDestroyed() && event.sender !== pdfViewerWindow.webContents)
        pdfViewerWindow.webContents.send('bookmarks-update', { filePath, bookmarks: update});

    return update;
});

ipcMain.handle('delete-bookmark', (event, { filePath, id}) =>  {    //delting a bookmark and signalizing it to the window to refresh
    const all = loadBookmarks();
    if (all[filePath]) {
        all[filePath] = all[filePath].filter(b => b.id !== id);
    }
    saveBookMarks(all);
    const update = all[filePath] || [];

    if (manualsWindow && !manualsWindow.isDestroyed() && event.sender !== manualsWindow.webContents)
        manualsWindow.webContents.send('bookmarks-update', { filePath, bookmarks: update});
    if (pdfViewerWindow && !pdfViewerWindow.isDestroyed() && event.sender !== pdfViewerWindow.webContents)
        pdfViewerWindow.webContents.send('bookmarks-update', { filePath, bookmarks: update});

    return update;
});

//----------------------------------------------- PLAYERS SCREEN ------------------------------------------

function sendPlayerState() {
    const state = { 
        bgPath: currentBgImage, 
        fgPath: currentFgImage,
        blackout: isBlackoutActive,
        initiativeData: currentInitiativeData
    };

    if(playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('update-player-view', state);
    }

    if(mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-preview', state);
    }

    if(playerControllerWindow && !playerControllerWindow.isDestroyed()) {
        playerControllerWindow.webContents.send('sync-preview', state);
    }
}

function createOrFocusPlayerWindow() {

    if (!playerWindow || playerWindow.isDestroyed()) {
        const { screen } = require('electron');
        const displays = screen.getAllDisplays();

        let targetDisplay = null;

        //if there's a second monitor, open the window there
        if (displays.length > 1) {
            targetDisplay = displays[1];
        } else {
            console.error("ERROR: you must to connect a second screen.");
            return;
        }

        playerWindow = new BrowserWindow({
            x: targetDisplay.bounds.x,
            y: targetDisplay.bounds.y,
            fullscreen: true,
            frame: false,
            alwaysOnTop: false,
            width: targetDisplay.bounds.width,
            height: targetDisplay.bounds.height,
            title: "Players' screen",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        playerWindow.loadFile('player-screen.html');

        playerWindow.on('closed', () => {
            playerWindow = null;
        });

    } else {
        if (playerWindow.isMinimized()) playerWindow.restore();
        playerWindow.focus();
    }
}

//------------------------------------------IPC SECOND SCREEN-------------------------------------------

ipcMain.on('toggle-player-screen', () => {
    if(!playerWindow || playerWindow.isDestroyed())
        createOrFocusPlayerWindow();
    else
        playerWindow.close();
});

ipcMain.on('player-window-ready', () => {
    sendPlayerState();
});

ipcMain.on('toggle-player-fullscreen', () => {
    if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.setFullScreen(!playerWindow.isFullScreen());
    }
});

ipcMain.on('toggle-blackout', (event, active) => {
    isBlackoutActive = active;
    sendPlayerState();
});

//adding a ping from the controller to the second screen
ipcMain.on('send-dm-ping', (event, { x, y }) => {
    if(playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('show-ping', {x, y});
    }
    if(playerControllerWindow && !playerControllerWindow.isDestroyed()) {
        playerControllerWindow.webContents.send('show-ping', {x, y});
    }
});

//adding a new window in players' screen
ipcMain.on('set-player-foreground', (event, filePath) => {
    currentFgImage = filePath;

    //if the window si not opened, open it
    if(!playerWindow || playerWindow.isDestroyed()) {
        createOrFocusPlayerWindow();
    }
    sendPlayerState();
});

//removing the last window
ipcMain.on('clear-player-foreground', () => {
    currentFgImage = null;
    sendPlayerState();
});

//choosing a new background for second screen
ipcMain.on('pick-player-background', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choose the new background.",
        filters: [{ name: "Pictures", extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp']}],
        properties: ['openFile']
    });

    if(!result.canceled || result.filePaths.length > 0) {
        currentBgImage = result.filePaths[0];
        sendPlayerState();
    }
});

//-----------------------------------------MANAGING INITIATIVE---------------------------------------------------
if (fs.existsSync(initiativeFilePath)) {
    try {
        currentInitiativeData = JSON.parse(fs.readFileSync(initiativeFilePath, 'utf-8'));
    } catch (err) {}
}

function openInitiativeWindow() {
    if(!initiativeWindow || initiativeWindow.isDestroyed()) {
        initiativeWindow = new BrowserWindow ({
            x: 0,
            y: 520,
            width: 480,
            height: 520,
            resizable: true,
            alwaysOnTop: true,
            title: "Initiative Tracker",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        initiativeWindow.loadFile('initiative.html');

        initiativeWindow.on('closed', () => {
            initiativeWindow = null;
        });
    } else {
        if (initiativeWindow.isMinimized()) initiativeWindow.restore();
        initiativeWindow.focus();
    }
}

//---------------------------------------IPC INITIATIVE--------------------------------------------------------------------
ipcMain.on('open-initiative-window', () => {
    openInitiativeWindow();
});

ipcMain.handle('get-initiative', () => {
    return currentInitiativeData;
});

ipcMain.on('save-initiative', (event, data) => {
    currentInitiativeData = data;

    try {
        fs.writeFileSync(initiativeFilePath, JSON.stringify(currentInitiativeData, null, 2), 'utf-8');
    }catch(err) {}

    sendPlayerState();
});

//---------------------------------------CONTROLLER WINDOW------------------------------------------------------------------
function openPlayerController () {
    if(!playerControllerWindow || playerControllerWindow.isDestroyed()) {
        playerControllerWindow = new BrowserWindow({
            x: 260,
            y: 70,
            width: 1400,
            height: 900,
            title: "Players' Screen - DM Vision",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        playerControllerWindow.loadFile('player-controller.html');

        playerControllerWindow.on('closed', () => {
            playerControllerWindow = null;
        });
    } else {
        playerControllerWindow.focus();
    }
}

//--------------------------------------------IPC CONTROLLER----------------------------------------------------------
ipcMain.on('open-player-controller', () => {
    if (playerWindow && !playerWindow.isDestroyed()) {
        openPlayerController();
        createOrFocusPlayerWindow();
    } else {
        console.warn("ERROR: second screen not aviable.");
    }
    
});

ipcMain.handle('get-shareable-windows', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: {
            width: 300,
            height: 180
        }
    });

    return sources
        .filter(s => !s.name.includes("Players' Screen") && !s.name.includes("Players' Screen - DM Vision"))
        .map(s => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL()
        }));
});

ipcMain.on('start-window-share', (event, sourceId) => {
    if (!playerWindow || playerWindow.isDestroyed()) {
        createOrFocusPlayerWindow();
    }
    if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('start-live-stream', sourceId);
    }
    if(playerControllerWindow && !playerControllerWindow.isDestroyed()) {
        playerControllerWindow.webContents.send('start-live-stream', sourceId);
    }
});

ipcMain.on('stop-window-share', () => {
    if(playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('stop-live-stream');
    }
    if(playerControllerWindow && !playerControllerWindow.isDestroyed()) {
        playerControllerWindow.webContents.send('stop-live-stream');
    }
});

// ---------------------------------------- SAVE AND QUIT -------------------------------------------------

ipcMain.on('save-and-quit', () => {
    const sessionData = {
        wordFilePath: currentFilePath,
        manualsFolderPath: currentDirectoryPath,
        manualsDirectoryOpen: (manualsWindow && !manualsWindow.isDestroyed()),
        notesWindowOpen: (notesWindow && !notesWindow.isDestroyed()),
        savedSeason: savedSeason,
        savedSession: savedSession,
        bgImage: currentBgImage,
        musicFolder: currentMusicFolderPath
    };

    try {
        fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf-8');
        console.log("Session saved correctly.");
    } catch (err) {
        console.error("ERROR: saved not found: ", err);
    }

    if (fileWatcher) fileWatcher.close();
    app.quit();
});