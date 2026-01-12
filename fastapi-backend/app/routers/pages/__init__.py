""" 
Pages submodule - Re-export router for backward compatibility
"""
# This allows `from app.routers import pages` to still work
# even though pages is now a package (directory) not a module (file)
from app.routers.pages_router import router

__all__ = ['router']
