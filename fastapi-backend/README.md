# Frontbase FastAPI Backend

This is the primary backend for Frontbase - a visual database builder and admin panel for Supabase.

## Setup Instructions

### Prerequisites
- Python 3.11 or higher
- pip (Python package manager)

### Installation

#### Windows
1. Double-click and run `setup.bat` OR
2. Open Command Prompt and run:
   ```
   setup.bat
   ```

#### macOS/Linux
1. Make the setup script executable:
   ```
   chmod +x setup.sh
   ```
2. Run the setup script:
   ```
   ./setup.sh
   ```

#### Manual Installation
If the setup scripts don't work, you can install the dependencies manually:

```bash
pip install -r requirements.txt
python init_db.py
```

### Running the Backend

After installation, start the FastAPI backend:

```bash
python -m uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### API Documentation
Once the backend is running, you can access the interactive API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Testing
To test the API endpoints, run:

```bash
python test_endpoints.py
```

## Dependencies
- FastAPI: Web framework for building APIs
- Uvicorn: ASGI server for running FastAPI
- Pydantic: Data validation using Python type annotations
- SQLAlchemy: SQL toolkit and Object-Relational Mapping (ORM) library
- aiosqlite: Async SQLite driver for SQLAlchemy
- passlib: Password hashing library
- python-multipart: For form data handling
- python-jose: For JWT authentication (future implementation)

## Project Structure

```
fastapi-backend/
├── main.py                 # Main FastAPI application
├── requirements.txt        # Python dependencies
├── setup.py               # Environment setup script
├── setup.sh               # Unix/Linux setup script
├── setup.bat              # Windows setup script
├── init_db.py             # Database initialization script
├── test_endpoints.py      # Endpoint testing script
├── app/
│   ├── database/
│   │   ├── config.py      # Database configuration
│   │   ├── migrate.py     # Database migration script
│   │   └── utils.py       # Database utility functions
│   ├── models/
│   │   ├── models.py      # SQLAlchemy models
│   │   └── schemas.py     # Pydantic models
│   └── routers/           # API route modules
│       ├── auth.py        # Authentication endpoints
│       ├── pages.py       # Page management endpoints
│       ├── project.py     # Project settings endpoints
│       ├── variables.py   # App variables endpoints
│       └── database.py    # Database connection endpoints
└── tests/                 # Test files
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login a user
- `GET /api/auth/me` - Get current user (JWT required)

### Pages
- `GET /api/pages` - Get all pages
- `POST /api/pages` - Create a new page
- `GET /api/pages/{id}` - Get a specific page
- `PUT /api/pages/{id}` - Update a page
- `DELETE /api/pages/{id}` - Delete a page

### Project
- `GET /api/project` - Get project settings
- `PUT /api/project` - Update project settings

### Variables
- `GET /api/variables` - Get all app variables
- `POST /api/variables` - Create a new variable
- `PUT /api/variables/{id}` - Update a variable
- `DELETE /api/variables/{id}` - Delete a variable

### Database
- `POST /api/database/test-connection` - Test database connection
- `GET /api/database/tables` - Get list of tables
- `GET /api/database/table-schema/{table}` - Get table schema
- `GET /api/database/table-data/{table}` - Get table data