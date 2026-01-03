# E2B Fragments

## Overview

E2B Fragments is an open-source AI code generation and execution platform, similar to Anthropic's Claude Artifacts or Vercel v0. Users can describe applications in natural language, and the system generates and executes code in secure sandboxed environments powered by E2B SDK.

The application supports multiple output templates (Python interpreter, Next.js, Vue.js, Streamlit, Gradio) and integrates with various LLM providers (OpenAI, Anthropic, Google AI, Mistral, Groq, Fireworks, Together AI, Ollama).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

- **Framework**: Next.js 14 with App Router and Server Actions
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: TailwindCSS with CSS variables for theming (light/dark mode support)
- **State Management**: React hooks with `usehooks-ts` for local storage persistence
- **AI Integration**: Vercel AI SDK (`ai` package) with `useObject` hook for streaming structured responses

### Backend Architecture

- **API Routes**: Next.js API routes in `app/api/` directory
  - `/api/chat` - Main LLM interaction endpoint using structured object streaming
  - `/api/morph-chat` - Code editing with Morph Apply model for efficient patching
  - `/api/sandbox` - E2B sandbox creation and code execution
- **Server Actions**: Located in `app/actions/` for publish and email validation

### Code Execution

- **E2B SDK**: Secure sandboxed code execution using `@e2b/code-interpreter`
- **Sandbox Templates**: Pre-built environments in `sandbox-templates/` directory
  - Each template includes build scripts and template definitions using E2B's Template API
  - Templates support Python (Streamlit, Gradio) and Node.js (Next.js, Vue.js) environments
- **Template Selection**: Auto-detection or manual selection of execution environment

### LLM Integration

- **Multi-Provider Support**: Abstracted in `lib/models.ts` using provider-specific SDK adapters
- **Model Configuration**: Stored in `lib/models.json` with provider, name, and multimodal capability metadata
- **Structured Output**: Uses Zod schema (`lib/schema.ts`) for validated AI responses containing code, dependencies, and metadata
- **Morph Apply**: Optional integration for token-efficient code editing via patching

### Authentication & Authorization

- **Supabase Auth**: Optional authentication via Supabase client (`lib/supabase.ts`)
- **OAuth Providers**: GitHub and Google sign-in support
- **Team Management**: User team associations for E2B sandbox access control
- **Feature Flag**: Enabled via `NEXT_PUBLIC_ENABLE_SUPABASE` environment variable

### Rate Limiting

- **Upstash Ratelimit**: Sliding window rate limiting using Vercel KV
- **Configurable**: `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW` environment variables
- **Bypass**: Users with custom API keys skip rate limiting

## External Dependencies

### Core Services

- **E2B**: Sandbox execution platform for running AI-generated code securely
- **Supabase**: Authentication, user management, and team associations (optional)
- **Vercel KV**: Redis-compatible key-value store for rate limiting and URL shortening

### LLM Providers

All providers are optional - configure via environment variables:
- OpenAI, Anthropic, Google AI (Gemini), Mistral, Groq, Fireworks, Together AI, Ollama
- Morph API for code patching optimization

### Analytics & Monitoring

- **PostHog**: Product analytics (optional, via `NEXT_PUBLIC_ENABLE_POSTHOG`)
- **Vercel Analytics**: Web analytics integration
- **ZeroBounce**: Email validation for sign-up (optional)

### Required Environment Variables

```
E2B_API_KEY          # Required for sandbox execution
```

### Optional Environment Variables

```
# LLM Providers (at least one required)
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
MISTRAL_API_KEY
GROQ_API_KEY
TOGETHER_API_KEY
FIREWORKS_API_KEY
MORPH_API_KEY

# Authentication
NEXT_PUBLIC_ENABLE_SUPABASE
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Rate Limiting
KV_REST_API_URL
KV_REST_API_TOKEN
RATE_LIMIT_MAX_REQUESTS
RATE_LIMIT_WINDOW

# Analytics
NEXT_PUBLIC_ENABLE_POSTHOG
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
```