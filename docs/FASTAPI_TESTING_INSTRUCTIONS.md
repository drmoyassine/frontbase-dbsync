# FastAPI Backend Testing Instructions

## Overview
This document provides instructions for testing Frontbase with the FastAPI backend. Authentication has been bypassed for testing purposes.

## Prerequisites
1. FastAPI backend running on port 8000
2. Frontbase frontend running on port 8080
3. Test data initialized in the database

## Setup Instructions

### 1. Start the FastAPI Backend
```bash
cd fastapi-backend
python -m uvicorn main:app --reload --port 8000
```

### 2. Initialize Test Data
In a new terminal, run:
```bash
cd fastapi-backend
python init_test_data.py
```

### 3. Start the Frontend

#### Unix/Linux
```bash
chmod +x start-frontend.sh
./start-frontend.sh
```

#### Windows
Double-click and run `start-frontend.bat` OR
```batch
start-frontend.bat
```

#### Manual Start
If the scripts don't work, you can start the frontend manually:

```bash
npm install
npm install axios
npm run dev
```

The frontend should be accessible at http://localhost:8080

### 4. Configure Backend
- Open the Frontend in your browser (http://localhost:8080)
- Navigate to the Dashboard
- Use the Backend Switcher component to ensure it's set to "FastAPI (Test)"
- If not, select "FastAPI (Test)" and click "Save and Reload"

## Testing Scenarios

### 1. Authentication Testing
- Navigate to the Login page
- Try to login with any username/password (authentication is bypassed)
- Verify that you are redirected to the Dashboard
- Verify that the user info shows "testuser"

### 2. Page Management Testing
- In the Dashboard, go to the Pages panel
- Verify that you can see the test pages ("Home Page" and "About Page")
- Try to create a new page
- Try to edit an existing page
- Try to delete a page
- Verify that all operations work correctly

### 3. Project Settings Testing
- In the Dashboard, go to the Settings panel
- Verify that you can see the project settings
- Try to update the project name and description
- Verify that changes are saved correctly

### 4. Variables Management Testing
- In the Dashboard, go to the Variables panel
- Verify that you can see the test variables ("siteTitle" and "footerText")
- Try to create a new variable
- Try to update an existing variable
- Try to delete a variable
- Verify that all operations work correctly

### 5. Database Connection Testing
- In the Dashboard, go to the Database panel
- Try to test a database connection (this will be a mock response for now)
- Verify that you can see the list of tables (mock response)
- Verify that you can see the table schema (mock response)

### 6. Page Builder Testing
- In the Dashboard, click on a page to open the Page Builder
- Try to add components to the page
- Try to edit component properties
- Try to save the page
- Verify that all operations work correctly

## Expected Results
1. All Frontbase functionality should work correctly with the FastAPI backend
2. No authentication errors should occur
3. All CRUD operations should work correctly
4. The frontend should be fully functional with the FastAPI backend

## Troubleshooting
- If you encounter any errors, check the FastAPI backend console for error messages
- If the frontend can't connect to the backend, verify that the backend is running on port 8000
- If the backend can't connect to the database, verify that the database file exists and is accessible

## Next Steps
After verifying that all functionality works correctly:
1. Implement proper JWT authentication in the FastAPI backend
2. Complete the database connection endpoints
3. Conduct performance testing
4. Prepare for production deployment