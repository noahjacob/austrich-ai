import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            AuSTRICH-AI
          </h1>
          <p className="text-xl text-gray-600 mb-4 max-w-3xl mx-auto">
            AI-powered OSCE analysis platform for medical education
          </p>
          <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
            Upload your OSCE transcripts or videos to receive comprehensive, 
            structured feedback on clinical knowledge, communication skills, 
            physical examination techniques, and critical actions.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/analyze')}
              className="btn-primary text-lg px-8 py-4"
            >
              Start Analysis
            </button>
          </div>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="card text-center">
            <div className="text-primary-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Transcript Analysis</h3>
            <p className="text-gray-600">
              Upload or paste your OSCE transcript for detailed analysis and feedback
            </p>
          </div>

          <div className="card text-center">
            <div className="text-primary-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Video Analysis</h3>
            <p className="text-gray-600">
              Upload OSCE video recordings with optional timestamp analysis
            </p>
          </div>

          <div className="card text-center">
            <div className="text-primary-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Structured Reports</h3>
            <p className="text-gray-600">
              Receive comprehensive feedback with scores, checklists, and timestamped insights
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

