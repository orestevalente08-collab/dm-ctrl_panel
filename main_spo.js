// ---------------------------------------- LIBRARIES -------------------------------------------------

//  app = main window, BrowserWindow = make windows, ipcMain = manage signals, dialog = open os's windows, shell = shell of the computer
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');    /* library to create and use windows */
const path = require('path');   /* library to read paths */
const fs = require('fs');   /* library to save on disk */
const mammoth = require('mammoth'); /* library to read .docx */
const { exec } = require('child_process'); /* library to use subwindows */

let mainWindow; // the main window is a global variable now
let notesWindow; // the window with the notes of the campaign
//saving variables
let currentFilePath = null; //path of the word's file
let fileWatcher = null; //observing if the file is being saved on the disk
let reloadTimeout = null;

const sessionFilePath = path.join(__dirname, 'session.json');   //making the path of the new file

// ---------------------------------------- MAIN CODE -------------------------------------------------

function createWindow() {   // window's maker

    mainWindow = new BrowserWindow ({
        x: 450,
        y: 10,
        width: 650,
        height: 200,
        alwaysOnTop: false,  // the window doesn't hide behind other windows
        resizable: true,    // the size can be changed using the mouse
        title: "DM-CTRLPanel",
        webPreferences: {
            nodeIntegration: true,  // we can use web files
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html'); //initializing an html file for graphic

    let startupPlaylist = null;

    if (fs.existsSync(sessionFilePath)) {   //saving the session's windows
        try {
            const rawData = fs.readFileSync(sessionFilePath, 'utf-8');
            const data = JSON.parse(rawData);
            if (data.spotifyPlaylist) startupPlaylist = data.spotifyPlaylist;
            
            if (data.wordFilePath && fs.existsSync(data.wordFilePath)) {
                currentFilePath = data.wordFilePath;
                startWatchingFile(currentFilePath);
                if (data.notesWindowOpen) {
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
                }
            }
        } catch (err) {
            console.error("ERROR: not reloaded session: ", err);
        }
    }

    shell.openExternal(startupPlaylist);

    setTimeout(() => {  /* minimizing the spotify window */
        const minimizeCmd = `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); }'; Get-Process Spotify -ErrorAction SilentlyContinue | ForEach-Object { if ($_.MainWindowHandle -ne 0) { [Win]::ShowWindowAsync($_.MainWindowHandle, 2) } }"`;
        exec(minimizeCmd);
    }, 1500);
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

// ---------------------------------------- LOADING SAVED SESSION -------------------------------------------------

ipcMain.on('main-window-ready', (event) => {
    if (fs.existsSync(sessionFilePath)) {
        try {
            const rawData = fs.readFileSync(sessionFilePath, 'utf-8');
            const sessionData = JSON.parse(rawData);
            event.reply('load-saved-session', sessionData);
        } catch (err) {
            console.error("ERROR: salved session not found:", err);
        }
    }
})

// ---------------------------------------- MANAGING NOTES -------------------------------------------------


ipcMain.on('open-notes-dialog', async () => {

    const result = await dialog.showOpenDialog(mainWindow, {    //opening window to select the file
        title: 'Select the file with note of the campaign',
        filters: [{ name: "Word Document", extensions: ['docx']}],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) { //if the file doesn't exist, close it
        return;
    }

    currentFilePath = result.filePaths[0];  //saving file's path

    if (!notesWindow || notesWindow.isDestroyed()) {
        notesWindow = new BrowserWindow({   //opening a new notes window
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

        notesWindow.loadFile('notes.html'); //loading the web file

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
});

// ---------------------------------------- SAVING AND QUITTING -------------------------------------------------

ipcMain.on('save-and-quit', (event, playlistId) => {
    const sessionData = {
        wordFilePath: currentFilePath,  //saving the path
        notesWindowOpen: (notesWindow && !notesWindow.isDestroyed()),    //saving if the file was open
        spotifyPlaylist: playlistId || null //saving the spotify playlist
    };

    try {
        fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf-8');   //writing the file
        console.log("Salved session correctly");
    } catch (err) { //managing errors
        console.error("ERROR: saving not done: ", err);
    }

    if (fileWatcher) fileWatcher.close();   //closing the watcher
    app.quit(); //closing the app
});

// ---------------------------------------- OPENING SPOTIFY -------------------------------------------------

ipcMain.on('open-spotify-app', (event, playlistUrl) => {
    if ( playlistUrl) {
        shell.openExternal(playlistUrl);    //writing in the shell the spotify url
        setTimeout(() => {  //minimizing the spotify window
            const minimizeCmd = `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); }'; Get-Process Spotify -ErrorAction SilentlyContinue | ForEach-Object { if ($_.MainWindowHandle -ne 0) { [Win]::ShowWindowAsync($_.MainWindowHandle, 2) } }"`;
            exec(minimizeCmd);
        }, 1500);
    }
});

ipcMain.on('spotify-control', (event, action) => {  //controller for spotify

    if(action === 'loop') { //loop command
        const psLoop = `powershell -NoProfile -Command "
            $proc = Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1;
            if ($proc) {
                $ws = New-Object -ComObject WScript.Shell;
                $ws.AppActivate($proc.Id);
                Start-Sleep -Milliseconds 60;
                $ws.SendKeys('^r');
                Start-Sleep -Milliseconds 60;
                Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); }';
                [Win]::ShowWindowAsync($proc.MainWindowHandle, 2);
            }
        "`;
        exec(psLoop);
        return;
    }

    const keyCodes = {  //main spotify controls
        playPause: '0xB3',
        next: '0xB0',
        prev: '0xB1'
    };

    const code = keyCodes[action];  //chose control
    if (code) {
        const psCommand = `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Key { [DllImport(\\\"user32.dll\\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }'; [Key]::keybd_event(${code}, 0, 0, [UIntPtr]::Zero); [Key]::keybd_event(${code}, 0, 2, [UIntPtr]::Zero);"`;
        exec(psCommand);    //executing the command
    }
});