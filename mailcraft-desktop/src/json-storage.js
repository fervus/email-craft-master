const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class JsonStorage {
  constructor() {
    this.dataDir = app.getPath('userData');
    this.settingsFile = path.join(this.dataDir, 'settings.json');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = fs.readFileSync(this.settingsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return {};
  }

  saveSettings(settings) {
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  getSmtpSettings() {
    const settings = this.loadSettings();
    return settings.smtp || null;
  }

  saveSmtpSettings(smtpSettings) {
    const settings = this.loadSettings();
    settings.smtp = smtpSettings;
    return this.saveSettings(settings);
  }

  getCampaignHistory() {
    const settings = this.loadSettings();
    return settings.campaigns || [];
  }

  saveCampaignResult(campaignResult) {
    const settings = this.loadSettings();
    if (!settings.campaigns) {
      settings.campaigns = [];
    }
    
    // Add new campaign at the beginning
    settings.campaigns.unshift(campaignResult);
    
    // Keep only last 50 campaigns
    if (settings.campaigns.length > 50) {
      settings.campaigns = settings.campaigns.slice(0, 50);
    }
    
    return this.saveSettings(settings);
  }
}

module.exports = JsonStorage;