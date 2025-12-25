#!/bin/bash

echo "Starting Frontbase frontend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Install axios if it's not already installed
echo "Checking for axios dependency..."
if ! npm list axios &> /dev/null; then
    echo "Installing axios..."
    npm install axios
fi

# Start the development server
echo "Starting development server..."
echo "Frontend will be available at http://localhost:8080"
npm run dev