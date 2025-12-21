const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server/utils/db.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the escaped quotes issue on line 185
content = content.replace(
    "const stmt = this.db.prepare('UPDATE pages SET deleted_at = ?, updated_at = datetime(\\\\'now\\\\') WHERE id = ?');",
    'const stmt = this.db.prepare("UPDATE pages SET deleted_at = ?, updated_at = datetime(\'now\') WHERE id = ?");'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Fixed syntax error in db.js');
