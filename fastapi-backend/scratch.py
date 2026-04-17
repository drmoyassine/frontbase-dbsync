import re
content = open('alembic/versions/1107e0ddc6fa_add_project_id_to_multi_tenant_models.py').read()
content = re.sub(r'(?m)^    op\.drop_table.*?$', '', content)
content = re.sub(r'(?ms)^    with op.batch_alter_table.*?drop_column.*?$    # ###', '    # ###', content)
content = re.sub(r'(?ms)^    with op.batch_alter_table.*?alter_column.*?$    # ###', '    # ###', content)
content = re.sub(r'(?ms)def downgrade\(\) -> None:.*?# ### end Alembic commands ###', 'def downgrade\() -> None:\n    pass\n    # ### end Alembic commands ###', content)
open('alembic/versions/1107e0ddc6fa_add_project_id_to_multi_tenant_models.py', 'w').write(content)

