#!/bin/bash

echo "Setting up FastAPI backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "pip3 is not installed. Please install pip3."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip3 install -r requirements.txt

# Check if installation was successful
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies."
    exit 1
fi

# Initialize database
echo "Initializing database..."
python3 init_db.py

# Check if database initialization was successful
if [ $? -ne 0 ]; then
    echo "Failed to initialize database."
    exit 1
fi

echo "Setup completed successfully!"
echo "You can now start the FastAPI backend with: python3 -m uvicorn main:app --reload --port 8000"