# Operon — Premium Knowledge Management System

**Production-ready platform with Google Drive integration, RBAC, and premium UX design.**

A next-generation knowledge management system that combines role-based access control, real-time document synchronization with Google Drive, and Apple-level design for modern teams.

## ✨ Features

### Core Platform
- **Role-Based Access Control**: 7 distinct roles with granular permissions
- **Google Drive Integration**: Primary document storage with real-time sync
- **Real-Time Synchronization**: Changes in Drive instantly reflect in Operon
- **Premium Design**: Linear, Arc, Stripe-inspired interface
- **Search & Discovery**: Full-text search with instant results
- **Activity Tracking**: Audit logs and user activity monitoring

### Google Drive Features
- **Automatic Organization**: Files auto-route to role-specific folders
- **Real-Time Webhooks**: Instant notifications of Drive changes
- **Metadata Sync**: Document metadata stored in Supabase
- **Version History**: Drive maintains all file versions
- **Collaborative Editing**: Native Drive collaboration preserved
- **File Preview**: Quick previews without opening Drive

### Premium Experience
- **Smooth Animations**: Apple-level transitions and interactions
- **Optimized Performance**: <2s First Contentful Paint
- **Responsive Design**: Perfect on mobile, tablet, and desktop
- **Accessible**: WCAG AA compliant
- **Keyboard Navigation**: Full keyboard support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Google Cloud account

### 1. Clone & Install

```bash
git clone https://github.com/your-org/operon.git
cd operon
npm install
```

### 2. Set Up Google Drive

1. [Create Google Cloud Project](DRIVE_OAUTH_GUIDE.md#step-1-create-google-cloud-project)
2. [Enable Drive API and Create OAuth Credentials](DRIVE_OAUTH_GUIDE.md#step-2-create-oauth-20-credentials)
3. Copy credentials to `.env.local`

### 3. Configure Environment

```bash
cp .env.example .env.local

# Edit .env.local with your credentials:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
DRIVE_TOKEN_ENCRYPTION_KEY=your-64-char-encryption-key
```

See [Environment Variables Guide](ENV_VARIABLES_GUIDE.md) for complete reference.

### 4. Set Up Database

```bash
# Create Supabase project
# Apply migrations
supabase migration up

# Verify schema
supabase db pull
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## 📖 Documentation

### Setup & Configuration
- [Google Drive Setup Guide](DRIVE_SETUP_GUIDE.md) — Complete Drive integration
- [OAuth 2.0 Implementation](DRIVE_OAUTH_GUIDE.md) — User authentication
- [Environment Variables Reference](ENV_VARIABLES_GUIDE.md) — All configuration options
- [Folder Structure Guide](DRIVE_FOLDER_STRUCTURE_GUIDE.md) — Organizing files

### Integration & Webhooks
- [Webhook Integration Guide](DRIVE_WEBHOOK_GUIDE.md) — Real-time sync setup

### Deployment & Operations
- [Deployment Guide](DEPLOYMENT_GUIDE.md) — Production setup
- [Architecture Overview](ARCHITECTURE.md) — System design

## 🎨 Design System

Operon uses a comprehensive design token system:

### Colors
```css
--color-bg-base: #060606;
--color-bg-surface: #111111;
--color-text-primary: #ffffff;
--color-text-secondary: rgba(255, 255, 255, 0.6);
--color-accent-gold: #f5a623;
```

### Motion
- Page transitions: 350ms fade + slide
- Hover interactions: scale 1.02 with border opacity
- Modals: backdrop blur + scale animation
- Smooth scrolling with Lenis-like behavior

### Typography
- Display: Satoshi, Plus Jakarta Sans
- Heading: Plus Jakarta Sans
- Body: Inter
- Mono: JetBrains Mono

### Spacing Scale
```
4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px, 80px, 100px, 128px, 160px
```

## 🔐 Security

- **OAuth 2.0**: Secure Google authentication
- **Token Encryption**: All Drive tokens encrypted at rest
- **Row-Level Security**: Supabase RLS policies
- **Rate Limiting**: API endpoint protection
- **HTTPS Only**: Enforced in production
- **CORS Protection**: Restricted origins

## 📊 Roles & Permissions

| Role | Purpose | Key Permissions |
|------|---------|-----------------|
| **Co-Founder** | Full platform access | All features |
| **HR** | People & policy management | HR docs, employee records |
| **Finance** | Financial documents | Finance docs, expense reports |
| **Team Lead** | Team documentation | Team docs, SOPs |
| **Content Creator** | Marketing assets | Marketing docs |
| **Employee** | Knowledge & resources | Read resources, own docs |
| **Intern** | Training & onboarding | Training materials |

## 🏗️ Project Structure

```
operon/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   │   └── drive/         # Google Drive endpoints
│   │   ├── login/             # Authentication
│   │   └── page.tsx           # Home page
│   ├── auth/                  # Authentication logic
│   │   ├── providers/         # Auth providers
│   │   └── guards/            # Route guards
│   ├── components/            # React components
│   │   ├── Sidebar.tsx
│   │   └── DocumentUpload.tsx
│   ├── core/                  # Core logic
│   │   ├── operon.ts         # Business logic
│   │   └── roles.ts          # Role definitions
│   ├── services/              # External services
│   │   ├── googleDrive.ts    # Drive integration
│   │   └── supabase.ts       # Database
│   ├── features/              # Feature modules
│   ├── styles/                # Global styles
│   │   ├── tokens.css        # Design tokens
│   │   ├── components.css    # Component styles
│   │   └── motion.css        # Animations
│   └── types/                 # TypeScript types
├── supabase/                  # Database schemas
├── .env.example              # Environment template
└── package.json
```

## 🔄 Data Flow

```
User Uploads File
    ↓
Operon Client
    ↓
Google Drive API (Upload)
    ↓
File stored in Drive
    ↓
Webhook Notification (Real-time)
    ↓
Operon Backend
    ↓
Update Metadata (Supabase)
Update Search Index
Generate Preview
    ↓
Real-time Subscriptions
    ↓
UI Updates Automatically
```

## 📈 Performance Targets

- **First Contentful Paint**: < 2s
- **Time to Interactive**: < 3.5s
- **API Response Time**: < 200ms
- **Database Query**: < 100ms
- **Search Latency**: < 500ms

## 🧪 Testing

```bash
# Run tests
npm run test

# Type checking
npm run type-check

# Linting
npm run lint

# Build check
npm run build
```

## 🚀 Deployment

### One-Click Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project)

### Manual Deployment

See [Deployment Guide](DEPLOYMENT_GUIDE.md) for:
- Docker deployment
- AWS deployment
- Self-hosted setup
- Performance optimization
- Monitoring setup

## 🛠️ Development

### Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Check code quality
npm run type-check   # TypeScript validation
npm run test         # Run tests
```

### Environment Setup

```bash
# Copy template
cp .env.example .env.local

# Install dependencies
npm install

# Sync database types
npm run db:types

# Start development
npm run dev
```

## 📚 API Documentation

### Google Drive Endpoints

**POST /api/drive/oauth-callback**
- OAuth redirect handler
- Exchanges code for tokens
- Creates folder structure

**POST /api/drive/upload**
- Upload file to Drive
- Auto-routes by role
- Stores metadata

**POST /api/drive/webhook**
- Real-time change notifications
- Processes Drive changes
- Updates Operon

## 🔗 Integration Guide

### Connect Your Tools

**Slack Integration** (Coming Soon)
- Document notifications
- Search from Slack
- Sharing workflow

**Microsoft Teams** (Coming Soon)
- Native Teams experience
- Document management
- Activity notifications

## 🐛 Troubleshooting

### OAuth Issues
See [OAuth Guide](DRIVE_OAUTH_GUIDE.md#step-10-troubleshooting)

### Upload Failures
See [Drive Setup Guide](DRIVE_SETUP_GUIDE.md#troubleshooting)

### Real-Time Sync
See [Webhook Guide](DRIVE_WEBHOOK_GUIDE.md#troubleshooting)

## 📞 Support

- **Documentation**: See guides above
- **Issues**: GitHub Issues
- **Email**: support@operon.io
- **Status**: [Status Page](https://status.operon.io)

## 📄 License

Proprietary — See LICENSE file

## 🙏 Acknowledgments

Inspired by the design and experience of:
- Linear
- Arc Browser
- Stripe Dashboard
- Apple
- Raycast
- Notion

## 📋 Changelog

### v1.0.0 (Current)
- ✅ Google Drive integration
- ✅ Real-time webhooks
- ✅ Role-based access control
- ✅ Premium design system
- ✅ Full-text search
- ✅ Activity tracking
- ✅ Production deployment

### v1.1.0 (Planned)
- [ ] Slack integration
- [ ] Microsoft Teams
- [ ] Advanced analytics
- [ ] Custom roles
- [ ] API key management

## 🎯 Roadmap

**Q3 2024**
- Launch core platform
- Enable production deployments
- Team collaboration features

**Q4 2024**
- Third-party integrations
- Advanced permissions
- Custom workflows

**2025**
- AI-powered search
- Automated categorization
- Predictive content

---

**Built with Next.js, TypeScript, Supabase, and Framer Motion**

For detailed guides, visit the documentation folder or see specific guides above.
