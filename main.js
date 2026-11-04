// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals
const { app, BrowserWindow, ipcMain, dialog } = require('electron');    /* library to create and use windows */
const path = require('path');   /* library to read paths */
const mammoth = require('mammoth'); /* library to read .docx */

let mainWindow; // the main window is a global variable now
let notesWindow; // the window with the notes of the campaign

// ---------------------------------------- FUNCTION FOR NOTES WINDOW -------------------------------------------------

let lastCampaignData = null;

function parseCampaignNotes (rawText) {
    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0); //dividing the lines of the text

    const campaign = {};    //initializing the matrix and the raws and columns
    let currentSeason = null;
    let currentSession = null;

    for (const line of lines) { //for all lines in the text

        if(/^stagione/i.test(line)) {   //searching a line starting with Stagione
            currentSeason = line;
            campaign[currentSeason] = {};
            currentSession = null; 
        }

        else if (/^sessione/i.test(line)) { //searching a line starting with Sessione
            currentSession = line.replace(/:$/, '').trim();
            if(!currentSeason) {
                currentSeason = "Initial Notes";
                campaign[currentSeason] = {};
            }
            if(!campaign[currentSeason][currentSession]) {
                campaign[currentSeason][currentSession] = [];
            }
        }

        else {  //adding normal lines to the right season and session
            if(!currentSeason) {
                currentSeason = "Initial Notes";
                campaign[currentSeason] = {};
            }
            if(!currentSession) {
                currentSession = "General";
                campaign[currentSeason][currentSession] = [];
            }
            campaign[currentSeason][currentSession].push(line);
        }
    }

    return campaign;    //returning the matrix
}

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
    if(process.platform !== 'darwin') { //to use all os
        app.quit();
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

        lastCampaignData = parseCampaignNotes(text);  //calling the function to divide the text

        if (notesWindow && !notesWindow.isDestroyed()) {    //making the window
            notesWindow.focus();
            notesWindow.webContents.send('init-notes', lastCampaignData);
        } else {
            notesWindow = new BrowserWindow({
                x: 10,
                y: 10,
                width: 450,
                height: 420,
                title: "Campaign Notes",
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            notesWindow.loadFile('notes.html'); //calling note.html
        }
    } catch (err) {
        console.error("ERROR: not reading file:", err); //founding error
    }
});

ipcMain.on('notes-window-ready', (event) => {   //when notes.html is ready, send the data
    if (lastCampaignData) {
        event.reply('init-notes', lastCampaignData);
    }
});