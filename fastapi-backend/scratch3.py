import re
content = open('alembic/versions/1107e0ddc6fa_add_project_id_to_multi_tenant_models.py').read()
content = content.replace('def downgrade\()', 'def downgrade()')
open('alembic/versions/1107e0ddc6fa_add_project_id_to_multi_tenant_models.py', 'w').write(content)

