import subprocess
import sys
import os
from pathlib import Path

def run_command(command, cwd=None):
    """Run a command and return the result"""
    result = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True)
    return result.returncode == 0, result.stdout, result.stderr

def setup_environment():
    """Set up the FastAPI development environment"""
    print("Setting up FastAPI backend environment...")
    
    # Create virtual environment
    print("Creating virtual environment...")
    success, stdout, stderr = run_command("python -m venv venv")
    if not success:
        print(f"Error creating virtual environment: {stderr}")
        return False
    
    # Determine the path to the virtual environment's Python executable
    if os.name == 'nt':  # Windows
        python_path = "venv\\Scripts\\python"
        pip_path = "venv\\Scripts\\pip"
    else:  # Unix/Linux/Mac
        python_path = "venv/bin/python"
        pip_path = "venv/bin/pip"
    
    # Install requirements
    print("Installing requirements...")
    success, stdout, stderr = run_command(f"{pip_path} install -r requirements.txt")
    if not success:
        print(f"Error installing requirements: {stderr}")
        return False
    
    # Run database migration
    print("Running database migration...")
    success, stdout, stderr = run_command(f"{python_path} app/database/migrate.py")
    if not success:
        print(f"Error running migration: {stderr}")
        return False
    
    print("Environment setup completed successfully!")
    print("\nTo start the development server:")
    print("1. Activate virtual environment:")
    if os.name == 'nt':
        print("   venv\\Scripts\\activate")
    else:
        print("   source venv/bin/activate")
    print("2. Start the server:")
    print("   python main.py")
    
    return True

if __name__ == "__main__":
    success = setup_environment()
    sys.exit(0 if success else 1)