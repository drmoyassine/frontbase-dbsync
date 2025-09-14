# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/4651ed78-2b9d-433c-88ca-fdbe2875e6cf

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/4651ed78-2b9d-433c-88ca-fdbe2875e6cf) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/4651ed78-2b9d-433c-88ca-fdbe2875e6cf) and click on Share -> Publish.

## Environment Variables

This project supports various environment variables for configuration. See `.env.example` for a complete list.

### Optional Configuration

**Server Settings:**
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `DB_PATH` - Database file path (default: ./database.sqlite)

**Admin User Settings:**
- `ADMIN_USERNAME` - Custom admin username (default: admin)
- `ADMIN_PASSWORD` - Custom admin password (default: admin123)
- `ADMIN_EMAIL` - Custom admin email (default: admin@frontbase.dev)

### Docker Deployment with Environment Variables

```yaml
# docker-compose.yml example
version: '3.8'
services:
  frontbase:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ADMIN_USERNAME=your_admin
      - ADMIN_PASSWORD=your_secure_password
      - ADMIN_EMAIL=admin@yourdomain.com
```

### Docker Deployment with Persistent Connections

**Critical for Supabase connections:**

```bash
# 1. Generate a secure encryption key
node -p "require('crypto').randomBytes(32).toString('hex')"

# 2. Set the encryption key in your environment
export ENCRYPTION_KEY=your_generated_key_here

# 3. Start the container
docker-compose up -d
```

**Example docker-compose.yml with persistent Supabase:**

```yaml
version: '3.8'
services:
  frontbase:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
      - ADMIN_USERNAME=your_admin
      - ADMIN_PASSWORD=your_secure_password
      - ADMIN_EMAIL=admin@yourdomain.com
```

### Security Notes

- **Demo Mode**: When no custom admin credentials are set, demo credentials are shown on the login page
- **Production**: Always set custom admin credentials for production deployments
- **Password Security**: Use strong passwords (minimum 6 characters, recommended 12+)
- **Encryption Key**: Required for persistent Supabase connections - generate with crypto.randomBytes(32)

### Troubleshooting

**Supabase Connection Lost on Restart:**
- Ensure `ENCRYPTION_KEY` environment variable is set
- Generate key with: `node -p "require('crypto').randomBytes(32).toString('hex')"`
- Verify the key persists across container restarts

**Database Access Issues:**
- Check RLS policies in Supabase dashboard
- Verify service key permissions
- See API.md for detailed endpoint documentation

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
