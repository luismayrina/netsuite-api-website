# NetSuite API Website

This project is the **NetSuite Rental Revenue Report Dashboard** that uses OAuth 2.0 Machine-to-Machine (M2M) authentication to connect to NetSuite.

## Installation & Setup

Because this project handles sensitive credentials, certain files have been ignored from git tracking `(.gitignore)` and will not be present when you first clone the repository. You must recreate them locally.

### 1. Prerequisites
- [Node.js](https://nodejs.org/en/) installed on your machine.
- Git (if cloning from a repository).

### 2. Install Dependencies
Run the following command in the root folder of the project to install all required packages:

```bash
npm install
```

### 3. Add Ignored Files

You will need to manually set up the files that were excluded from Version Control:

#### A. Set up `.env` File
Create a new file called `.env` in the root directory and populate it with your environment variables. Here is the template representation based on what is required:

```env
# ═══════════════════════════════════════════════════════════
# NetSuite OAuth 2.0 M2M Configuration
# ═══════════════════════════════════════════════════════════

# NetSuite Account ID (from Company > Company Information)
NS_ACCOUNT_ID=YOUR_ACCOUNT_ID

# Client ID from Integration Record (M2M enabled)
NS_CLIENT_ID=YOUR_CLIENT_ID

# Certificate ID from M2M Setup page (after uploading certificate.pem)
# Format: custcertificate_XXXXX
NS_CERTIFICATE_ID=YOUR_CERTIFICATE_ID

# Path to your private key file (it assumes it's in the root dir)
NS_PRIVATE_KEY_PATH=./private_key.pem

# Server port
PORT=3000
```

#### B. Set up Certificates / Keys
You will also need to place the following security keys in the root directory:
- `private_key.pem`
- `certificate.pem`

*(Note: Never commit your real `.env`, `private_key.pem`, or `certificate.pem` to the repository. The `.gitignore` is set up to block these from being accidentally committed.)*

### 4. Running the Application

You can start the development server using:

```bash
npm start
# or
npm run dev
```

The server should start running, and typically it will be available at `http://localhost:3000` (or whatever `PORT` you configured in your `.env` file).
