import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Tabs from '../components/Tabs';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { analyzeTranscript, analyzeVideo } from '../api/client';

export default function Analyze() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'transcript' | 'video'>('transcript');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transcript state
  const [transcript, setTranscript] = useState('');

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [timestamp, setTimestamp] = useState('');

  const handleTranscriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTranscript(event.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      setError('Please upload a .txt file');
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
    }
  };

  const handleTranscriptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) {
      setError('Please enter or upload a transcript');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeTranscript({ transcript });
      navigate(`/reports/${response.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze transcript');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      setError('Please upload a video file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const timestampNum = timestamp ? parseFloat(timestamp) : undefined;
      const response = await analyzeVideo({
        video_file: videoFile,
        timestamp: timestampNum,
      });
      navigate(`/reports/${response.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'transcript', label: 'Transcript Analysis' },
    { id: 'video', label: 'Video Analysis' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">OSCE Analysis</h1>
          
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as 'transcript' | 'video')} />

          {error && <ErrorMessage message={error} />}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {activeTab === 'transcript' && (
                <form onSubmit={handleTranscriptSubmit} className="mt-6">
                  <div className="mb-6">
                    <label htmlFor="transcript" className="block text-sm font-medium text-gray-700 mb-2">
                      Transcript
                    </label>
                    <textarea
                      id="transcript"
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={12}
                      className="input-field"
                      placeholder="Paste your OSCE transcript here..."
                    />
                  </div>

                  <div className="mb-6">
                    <label htmlFor="transcript-file" className="block text-sm font-medium text-gray-700 mb-2">
                      Or upload a .txt file
                    </label>
                    <input
                      id="transcript-file"
                      type="file"
                      accept=".txt"
                      onChange={handleTranscriptFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !transcript.trim()}
                    className="btn-primary w-full sm:w-auto"
                  >
                    Analyze Transcript
                  </button>
                </form>
              )}

              {activeTab === 'video' && (
                <form onSubmit={handleVideoSubmit} className="mt-6">
                  <div className="mb-6">
                    <label htmlFor="video-file" className="block text-sm font-medium text-gray-700 mb-2">
                      Video File
                    </label>
                    <input
                      id="video-file"
                      type="file"
                      accept="video/*"
                      onChange={handleVideoFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                    />
                    {videoFile && (
                      <p className="mt-2 text-sm text-gray-600">
                        Selected: {videoFile.name}
                      </p>
                    )}
                  </div>

                  <div className="mb-6">
                    <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-2">
                      Timestamp (seconds) - Optional
                    </label>
                    <input
                      id="timestamp"
                      type="number"
                      value={timestamp}
                      onChange={(e) => setTimestamp(e.target.value)}
                      min="0"
                      step="0.1"
                      className="input-field"
                      placeholder="e.g., 120.5"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Specify a timestamp in seconds to analyze a specific moment in the video
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !videoFile}
                    className="btn-primary w-full sm:w-auto"
                  >
                    Analyze Video
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

