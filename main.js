// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals
const { app, BrowserWindow, ipcMain, dialog } = require('electron');    /* library to create and use windows */
const path = require('path');   /* library to read paths */
const mammoth = require('mammoth'); /* library to read .docx */

let mainWindow; // the main window is a global variable now
let notesWindow; // the window with the notes of the campaign

// ---------------------------------------- FUNCTION FOR NOTES WINDOW -------------------------------------------------

function parseCampaignNotes (rawText) {
    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.lenght > 0); //dividing the lines of the text

    const campaign = {};    //initializing the matrix and the raws and columns
    let currentSeason = "General Notes";
    let currentSession = "Intro";

    campaign[currentSeason] = {};
    campaign[currentSeason][currentSession] = {};

    for (const line in lines) { //for all lines in the text

        if(/^stagione/i.test(line)) {   //searching a line starting with Stagione
            currentSeason = line;
            if(!campaign[currentSeason]) {
                campaign[currentSeason] = {};
            }
            currentSession = "General"; 
            campaign[currentSeason][currentSession] = [];
        }

        else if (/^sessione/i.text(line)) { //searching a line starting with Sessione
            currentSession = line;
            if(!campaign[currentSeason][currentSession]) {
                campaign[currentSeason][currentSession] = [];
            }
        }

        else {  //adding normal lines to the right season and session
            campaign[currentSeason][currentSession].push(line);
        }
    }

    return campaign;    //returning the matrix
}

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

        const campaignData = parseCampaignNotes(text);  //calling the function to divide the text

        if (!notesWindow || notesWindow.isDestroyed()) {    //making the window
            notesWindow = new BrowserWindow({
                width: 800,
                height: 600,
                title: "Campaign Notes",
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            notesWindow.loadFile('notes.html'); //calling note.html

            notesWindow.webContents.on('did-finish-load', () => {   //when the page finished loading
                notesWindow.webContents.send('init-notes', campaignData);   //send the data to the page
            });
        } else {    //if the window already exists
            notesWindow.focus();    //the window jump out
            notesWindow.webContents.send('init-notes', campaignData);   //send the data to the page
        }

    } catch (err) {
        console.error("ERROR: not reading file:", err); //founding error
    }

});