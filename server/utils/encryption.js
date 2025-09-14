const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Generate or use existing encryption key
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    return Buffer.from(key, 'hex');
  }
  // Generate a new key (in production, this should be stored securely)
  return crypto.randomBytes(KEY_LENGTH);
};

const ENCRYPTION_KEY = getEncryptionKey();

const encrypt = (text) => {
  if (!text) return null;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
  cipher.setAAD(Buffer.from('frontbase-db-creds'));
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
};

const decrypt = (encryptedData) => {
  if (!encryptedData || typeof encryptedData !== 'object') return null;
  
  try {
    const { encrypted, iv, tag } = encryptedData;
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
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