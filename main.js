// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals, dialog = open os's windows, shell = shell of the computer
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');    /* library to create and use windows */
const path = require('path');   /* library to read paths */
const fs = require('fs');   /* library to save on disk */
const mammoth = require('mammoth'); /* library to read .docx */

let mainWindow; // the main window is a global variable now
let notesWindow; // the window with the notes of the campaign
//saving variables
let currentFilePath = null;
let fileWatcher = null; //observing if the file is being saved on the disk
let reloadTimeout = null;

// ---------------------------------------- BASE CODE -------------------------------------------------

function createWindow() {   // window's maker

    mainWindow = new BrowserWindow ({
        x: 450,
        y: 10,
        width: 650,
        height: 150,
        alwaysOnTop: false,  // the window doesn't hide behind other windows
        resizable: true,    // the size can be changed using the mouse
        title: "DM-CTRLPanel",
        webPreferences: {
            nodeIntegration: true,  // we can use web files
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html'); //initializing an html file for graphic
}

app.whenReady().then(createWindow); // starting app

app.on('window-all-closed', () => { //closing app
    if(fileWatcher) fileWatcher.close(); //closing watcher
    if(process.platform !== 'darwin') { //to use all os
        app.quit();
    }
});

// ---------------------------------------- USING WORD FUNCTIONS -------------------------------------------------

async function loadAndSendWordFile(filePath) {  //reading the Word's file
    try {
        const { value : html } = await mammoth.convertToHtml({ path: filePath});

        if(notesWindow && !notesWindow.isDestroyed()) {
            notesWindow.webContents.send('init-notes-html', html);
        }

    } catch (err) {
        console.log('Retrying to read the file...');
    }
}

async function startWatchingFile(filePath) {    //initializing the watcher
    if(fileWatcher) fileWatcher.close();

    fileWatcher = fs.watch(filePath, (eventType) => {
        if(reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
            console.log("Updated Word! I'm reloading...");
            loadAndSendWordFile(filePath);
        }, 400);
    });
}

// ---------------------------------------- MANAGING NOTES -------------------------------------------------


ipcMain.on('open-notes-dialog', async () => {

    const result = await dialog.showOpenDialog(mainWindow, {    //opening window to select the file
        title: 'Select the file with note of the campaign',
        filters: [{ name: "Word Document", extensions: ['docx']}],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return;
    }

    currentFilePath = result.filePaths[0];  //saving file's path

    if (!notesWindow || notesWindow.isDestroyed()) {
        notesWindow = new BrowserWindow({
            x: 5,
            y: 10,
            width: 450,
            height: 460,
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

ipcMain.on('notes-window-ready', async () => {   //when notes.html is ready, send the data
    if (currentFilePath) {
        await loadAndSendWordFile(currentFilePath);
    }
});

ipcMain.on('open-in-word', () => {  //when is asked, open Word using the shell
    if(currentFilePath) {
        shell.openPath(currentFilePath);
    }
})