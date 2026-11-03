// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals
const { app, BrowserWindow, ipcMain, dialog } = require('electron');    /* library to create and use windows */
const path = require('path');   /* library to read paths */
const mammoth = require('mammoth'); /* library to read .docx */

let mainWindow; // the main window is a global variable now
let notesWindow; // the window with the notes of the campaign

// ---------------------------------------- BASE CODE -------------------------------------------------

function createWindow() {   // window's maker

    const win = new BrowserWindow ({
        width: 650,
        height: 300,
        alwaysOnTop: false,  // the window doesn't hide behind other windows
        resizable: true,    // the size can be changed using the mouse
        title: "DM-CTRLPanel",
        webPreferences: {
            nodeIntegration: true,  // we can use web files
            contextIsolation: false
        }
    });

    win.loadFile('index.html'); //initializing an html file for graphic
}

app.whenReady().then(createWindow); // starting app

app.on('window-all-closed', () => { //closing app
    if(process.platform !== 'darwin') { //to use all os
        app.quit;
    }
});

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

    const filePath = result.filePaths[0];   //saving file's path
    console.log("Select file:", filePath);

    try {

        const { value: text } = await mammoth.extractRawText({ path: filePath });   //extracting the text from the file

        console.log("---PREVIEW EXTRACTED TEXT---");
        console.log(text.substring(0, 300));    //printing the first 300 char
        console.log("-------------------------------");

    } catch (err) {
        console.error("ERROR: not reading file:", err);
    }

});