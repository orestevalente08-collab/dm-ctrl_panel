// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals, dialog = open os's windows, shell = shell of the computer
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron'); //library to use electron
const path = require('path');   //library to use paths
const fs = require('fs');   //library to use file system
const mammoth = require('mammoth'); //library to read word files

let mainWindow;     // main window with all features
let notesWindow;    // window with DM's notes
let manualsWindow;  // window with manuals directory

let currentFilePath = null; // file word's path
let currentDirectoryPath = null;    //manuals directory's path
let fileWatcher = null;     // watcher to save the word file
let reloadTimeout = null;

let savedSeason = null; //saved season to remember it
let savedSession = null;    //saved session to remember it

const sessionFilePath = path.join(__dirname, 'session.json');

// ---------------------------------------- MAIN CODE -------------------------------------------------

function createWindow() {

    mainWindow = new BrowserWindow({    // main bar with buttons
        x: 450,
        y: 10,
        width: 650,
        height: 120,
        alwaysOnTop: true,
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
                        x: 10,
                        y: 10,
                        width: 450,
                        height: 500,
                        title: "DM's Notes",
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false
                        }
                    });
                    notesWindow.loadFile('notes.html');
                }
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
            x: 10,
            y: 10,
            width: 450,
            height: 500,
            title: "DM's Notes",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        notesWindow.loadFile('notes.html');
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

// ---------------------------------------- SAVE AND QUIT -------------------------------------------------

ipcMain.on('save-and-quit', () => {
    const sessionData = {
        wordFilePath: currentFilePath,
        manualsFolderPath: currentDirectoryPath,
        manualsDirectoryOpen: (manualsWindow && !manualsWindow.isDestroyed()),
        notesWindowOpen: (notesWindow && !notesWindow.isDestroyed()),
        savedSeason: savedSeason,
        savedSession: savedSession
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