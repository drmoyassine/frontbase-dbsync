import sqlite3
c = sqlite3.connect('unified.db')
c.execute('UPDATE project_settings SET supabase_url=NULL, supabase_anon_key=NULL, supabase_service_key_encrypted=NULL')
c.commit()
c.close()
print('SUCCESS: Credentials cleared from project_settings')
