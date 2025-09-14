const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Persistent key storage
const DATA_DIR = path.join(__dirname, '../../data');
const KEY_FILE = path.join(DATA_DIR, 'encryption.key');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Generate or use existing encryption key
const getEncryptionKey = () => {
  // First try environment variable
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    return Buffer.from(envKey, 'hex');
  }
  
  // Then try persistent file
  try {
    if (fs.existsSync(KEY_FILE)) {
      const keyData = fs.readFileSync(KEY_FILE, 'utf8');
      return Buffer.from(keyData, 'hex');
    }
  } catch (error) {
    console.warn('Failed to read encryption key from file:', error.message);
  }
  
  // Generate new key and save it
  const newKey = crypto.randomBytes(KEY_LENGTH);
  try {
    fs.writeFileSync(KEY_FILE, newKey.toString('hex'), 'utf8');
    console.log('Generated new encryption key and saved to file');
  } catch (error) {
    console.warn('Failed to save encryption key to file:', error.message);
  }
  
  return newKey;
};

const ENCRYPTION_KEY = getEncryptionKey();

const encrypt = (text) => {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    cipher.setAAD(Buffer.from('frontbase-db-creds'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
};

const decrypt = (encryptedData) => {
  if (!encryptedData || typeof encryptedData !== 'object') return null;
  
  try {
    const { encrypted, iv, tag } = encryptedData;
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
    decipher.setAAD(Buffer.from('frontbase-db-creds'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

module.exports = { encrypt, decrypt };