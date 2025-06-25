const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;

// Disable hardware acceleration to prevent crashes
app.disableHardwareAcceleration();

function createWindow() {
  console.log('Creating minimal window...');
  
  // Create the browser window with very conservative settings
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#ffffff'
  });

  // Load the app
  mainWindow.loadFile('public/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('Window ready and shown');
  });

  mainWindow.on('closed', function () {
    console.log('Window closed');
    mainWindow = null;
  });
}

// Simple app lifecycle
app.on('ready', () => {
  console.log('App ready, creating window...');
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Basic IPC handlers without database
ipcMain.handle('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileContent = fs.readFileSync(filePath);
    
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      fileContent: fileContent.toString('base64')
    };
  }
  
  return { success: false, canceled: true };
});

ipcMain.handle('select-folder-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return {
      success: true,
      folderPath: result.filePaths[0]
    };
  }
  
  return { success: false, canceled: true };
});

// Mock SMTP handlers to test if database is the issue
ipcMain.handle('save-smtp-settings', async (event, settings) => {
  console.log('Mock: SMTP settings saved');
  return { success: true };
});

ipcMain.handle('load-smtp-settings', async (event) => {
  console.log('Mock: Loading SMTP settings');
  return { success: true, data: null };
});

ipcMain.handle('test-smtp-connection', async (event, settings, testEmail) => {
  console.log('Mock: Testing SMTP connection');
  return { success: true };
});

console.log('Minimal main process loaded');