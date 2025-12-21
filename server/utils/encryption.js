const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Persistent key storage - use environment variable or absolute path for Docker
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const KEY_FILE = path.join(DATA_DIR, 'encryption.key');

console.log('Encryption setup - DATA_DIR:', DATA_DIR, 'KEY_FILE:', KEY_FILE);

// Ensure data directory exists with error handling
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
  }
} catch (error) {
  console.warn('Failed to create data directory:', error.message);
  console.warn('Will use environment variable fallback for encryption key');
}

// Generate or use existing encryption key with proper validation
const getEncryptionKey = () => {
  // CRITICAL: Only use environment variable when set to ensure persistence
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    console.log('Using ENCRYPTION_KEY from environment variable');
    
    // Validate the environment key format
    if (!/^[a-fA-F0-9]{64}$/.test(envKey)) {
      console.error('ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)');
      console.error('Generate one with: node -p "require(\'crypto\').randomBytes(32).toString(\'hex\')"');
      process.exit(1);
    }
    
    return Buffer.from(envKey, 'hex');
  }
  
  console.warn('ENCRYPTION_KEY not found in environment variables');
  console.warn('This will cause Supabase connections to be lost on container restart');
  console.warn('Set ENCRYPTION_KEY in your environment to fix this issue');
  
  // Try persistent file as fallback (for development only)
  try {
    if (fs.existsSync(KEY_FILE)) {
      console.log('Using fallback encryption key from file (development only)');
      const keyData = fs.readFileSync(KEY_FILE, 'utf8');
      return Buffer.from(keyData, 'hex');
    }
  } catch (error) {
    console.warn('Failed to read encryption key from file:', error.message);
  }
  
  // Generate new key and save it (development fallback)
  console.warn('Generating new encryption key - connections will be lost on restart');
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