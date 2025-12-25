import re
import logging
from typing import Any, Dict, Optional
from jinja2 import Environment, BaseLoader, TemplateSyntaxError, UndefinedError

logger = logging.getLogger("app.services.expression_engine")

class ExpressionEngine:
    """
    Evaluates sync rules and field mappings using Jinja2 templates.
    Supports variables like {{ master.field }} and {{ slave.field }}.
    """
    
    def __init__(self):
        # Create a restricted Jinja2 environment
        self.env = Environment(loader=BaseLoader())
        
    def _prepare_context(self, master_data: Dict[str, Any], slave_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Wrap data in master/slave keys for clear referencing."""
        return {
            "master": master_data,
            "slave": slave_data or {},
            "m": master_data, # Shorthand
            "s": slave_data or {}, # Shorthand
        }

    def evaluate(self, expression: str, master_data: Dict[str, Any], slave_data: Optional[Dict[str, Any]] = None) -> Any:
        """
        Evaluates an expression.
        
        Example expressions:
        - "master.id" -> returns the ID from master
        - "{{ master.price * 1.2 }}" -> returns master price + 20%
        - "M > S" -> (Future logic)
        """
        if not expression:
            return None
            
        # Handle simple @field shorthand (converting to {{ master.field }})
        if expression.startswith("@"):
            field_name = expression[1:]
            expression = f"{{{{ master['{field_name}'] }}}}"
        
        # If it doesn't contain {{ }}, wrap it if it looks like a field name
        # but let's be safe and only use Jinja if explicitly requested or @ used
        if "{{" not in expression:
             # Try to evaluate as a direct key lookup first for speed
             # If it's a simple string like "id", it might be intended as master.id
             # However, to be robust, we encourage {{ }} or @
             context = self._prepare_context(master_data, slave_data)
             try:
                 # Check if it's a direct key in master
                 if expression in master_data:
                     return master_data[expression]
                 # Or check if it's "master.field" notation
                 if expression.startswith("master."):
                     f = expression.split(".", 1)[1]
                     return master_data.get(f)
             except Exception:
                 pass
             
             # Fallback: treat as raw string if no Jinja and not found in context
             return expression

        try:
            template = self.env.from_string(expression)
            context = self._prepare_context(master_data, slave_data)
            result = template.render(**context)
            
            # Try to convert back to number/bool if it looks like one
            if result.lower() == "true": return True
            if result.lower() == "false": return False
            try:
                if "." in result: return float(result)
                return int(result)
            except ValueError:
                return result
                
        except (TemplateSyntaxError, UndefinedError) as e:
            logger.error(f"Expression evaluation failed: {expression} - {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in expression engine: {str(e)}")
            return None

    def validate_syntax(self, expression: str) -> bool:
        """Check if the Jinja syntax is valid."""
        try:
            self.env.from_string(expression)
            return True
        except TemplateSyntaxError:
            return False
