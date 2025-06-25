# MailCraft - Email Campaign Platform

MailCraft is a modern email campaign platform built with Next.js, React, Clerk, and Convex. It allows you to send personalized emails with attachments to recipients imported from CSV or Excel files.

## Features

- **Recipients Management**: Upload CSV/Excel files with recipient data
- **Email Configuration**: HTML/Text format, send rate limiting, priority settings
- **Email Template**: Create and preview email templates with variable substitution
- **Attachments**: Drag and drop file attachments
- **SMTP Configuration**: Configure your own SMTP server
- **Campaign Management**: Track sent emails and campaign statistics
- **Authentication**: Secure user authentication with Clerk

## Tech Stack

- **Frontend**: React.js, Next.js 15, TypeScript, Tailwind CSS
- **Authentication**: Clerk
- **Database**: Convex
- **UI Components**: Radix UI, Lucide Icons
- **File Processing**: XLSX, PapaParse
- **Deployment**: Vercel (recommended)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Clerk account for authentication
- Convex account for database

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd EmailCraftmaster
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file with the following:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

NEXT_PUBLIC_CONVEX_URL=your_convex_url
```

4. Run the development server:
```bash
npm run dev
```

5. In a separate terminal, run Convex:
```bash
npx convex dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Sign Up/Sign In**: Create an account or sign in using Clerk authentication
2. **Configure SMTP**: Click on the account menu and go to "Email SMTP Server" to configure your email server
3. **Upload Recipients**: In the Recipients tab, upload a CSV or Excel file with recipient data
4. **Create Email**: Configure email settings, write your template, and preview it
5. **Add Attachments**: Switch to the Attachments tab to upload files
6. **Send Campaign**: Review your settings and start the campaign

## Project Structure

```
EmailCraftmaster/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── layout.tsx            # Root layout with providers
│   ├── globals.css           # Global styles
│   ├── sign-in/              # Clerk sign-in page
│   ├── sign-up/              # Clerk sign-up page
│   └── settings/
│       └── smtp/             # SMTP configuration page
├── components/
│   ├── ui/                   # Reusable UI components
│   ├── recipients-tab.tsx    # Recipients management
│   ├── attachments-tab.tsx   # Attachments management
│   └── account-menu.tsx      # User account dropdown
├── convex/
│   ├── schema.ts             # Database schema
│   ├── campaigns.ts          # Campaign queries/mutations
│   ├── recipients.ts         # Recipients queries/mutations
│   └── smtp.ts               # SMTP settings queries/mutations
├── lib/
│   └── utils.ts              # Utility functions
└── public/                   # Static assets
```

## Next Steps

To complete the platform, you'll need to:

1. **Set up Convex**: Run `npx convex dev` and follow the setup instructions to connect to your Convex deployment
2. **Implement Email Sending**: Create a Python backend service or use a Node.js service to handle actual email sending
3. **Add Campaign Tracking**: Implement real-time updates for campaign progress
4. **Deploy**: Deploy to Vercel or your preferred hosting platform

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.