# AuSTRICH-AI Frontend

A production-grade React frontend for AuSTRICH-AI, an AI-powered OSCE (Objective Structured Clinical Examination) analysis platform.

## Tech Stack

- **React 19** with **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Fetch API** for HTTP requests

## Features

- 📝 **Transcript Analysis**: Upload or paste OSCE transcripts for AI-powered analysis
- 🎥 **Video Analysis**: Upload OSCE video recordings with optional timestamp analysis
- 📊 **Comprehensive Reports**: View detailed feedback including:
  - Overall score with visual indicators
  - Clinical knowledge assessment
  - Communication skills evaluation
  - Physical examination feedback
  - Checklist results
  - Timestamped feedback
  - Missed critical actions

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
VITE_API_URL=http://localhost:8000
```

Replace `http://localhost:8000` with your FastAPI backend URL.

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

### Building for Production

Build the production bundle:
```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

### Deployment on Vercel

1. Push your code to a Git repository (GitHub, GitLab, etc.)

2. Import your project in Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your repository

3. Configure environment variables:
   - Add `VITE_API_URL` with your production API URL

4. Deploy:
   - Vercel will automatically detect Vite and configure the build
   - The project will build and deploy automatically

## Project Structure

```
src/
  ├── api/           # API client functions
  ├── components/    # Reusable UI components
  ├── hooks/         # Custom React hooks (if needed)
  ├── pages/         # Page components
  ├── types/         # TypeScript type definitions
  ├── App.tsx        # Main app component with routing
  └── main.tsx       # Entry point
```

## API Endpoints

The frontend expects the following FastAPI endpoints:

- `POST /osce/analyze-transcript` - Analyze a transcript
- `POST /osce/analyze-video` - Analyze a video file
- `GET /reports/{id}` - Get a report by ID

All requests are made to the URL specified in `VITE_API_URL` environment variable.

## Environment Variables

- `VITE_API_URL` - Base URL for the FastAPI backend (default: `http://localhost:8000`)

## Development Notes

- The app uses Tailwind CSS utility classes for styling
- All API calls use the Fetch API (no axios)
- TypeScript types are defined in `src/types/index.ts`
- Error handling and loading states are implemented throughout
- The UI follows a medical-grade, clean design with blue accents

## License

Private project - All rights reserved
