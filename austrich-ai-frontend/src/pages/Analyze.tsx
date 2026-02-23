import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { analyzeTranscript } from '../api/client';

export default function Analyze() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-haiku-4-5-20251001-v1:0');

  const models = [
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude 4.5 Haiku' },
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude 4.5 Sonnet' },
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/plain') {
      setTranscriptFile(file);
      setError(null);
    } else {
      setError('Please upload a .txt file');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transcriptFile) {
      setError('Please upload a transcript file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeTranscript({ 
        file: transcriptFile, 
        model_id: selectedModel 
      });
      navigate(`/reports/${response.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze transcript');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">OSCE Analysis</h1>

          {error && <ErrorMessage message={error} />}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <form onSubmit={handleSubmit} className="mt-6">
              <div className="mb-6">
                <label htmlFor="transcript-file" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Transcript (.txt file)
                </label>
                <input
                  id="transcript-file"
                  type="file"
                  accept=".txt"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                {transcriptFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {transcriptFile.name}
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
                  AI Model
                </label>
                <select
                  id="model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="input-field"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading || !transcriptFile}
                className="btn-primary w-full sm:w-auto"
              >
                Analyze Transcript
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

