import { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import AudioRecorder from '../components/AudioRecorder';
import { analyzeTranscript, getReport } from '../api/client';
import type { OSCEReport } from '../types';

interface ChecklistItem {
  item: string;
  status: 'Yes' | 'No' | 'Not Sure';
  evidence: string | null;
  timestamp: string | null;
  timestamp_end?: string | null;
}

export default function Analyze() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-haiku-4-5-20251001-v1:0');
  const [progressMessage, setProgressMessage] = useState<string>('');

  const [report, setReport] = useState<OSCEReport | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [highlightedRange, setHighlightedRange] = useState<{start: string, end: string} | null>(null);

  const models = [
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude 4.5 Haiku' },
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude 4.5 Sonnet' },
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
  ];

  const handleRecordingComplete = (audioBlob: Blob, filename: string) => {
    const file = new File([audioBlob], filename, { type: 'audio/webm' });
    setTranscriptFile(file);
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = ['txt', 'mp3', 'wav', 'm4a', 'flac', 'ogg', 'webm'];
      
      if (validExtensions.includes(ext || '')) {
        setTranscriptFile(file);
        setError(null);
      } else {
        setError('Please upload a .txt or audio file (.mp3, .wav, .m4a, .flac, .ogg)');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transcriptFile) {
      setError('Please upload a file or record audio first');
      return;
    }

    setLoading(true);
    setError(null);
    setProgressMessage('Starting analysis...');
    setReport(null);

    try {
      const response = await analyzeTranscript(
        { 
          file: transcriptFile, 
          model_id: selectedModel 
        },
        (message) => setProgressMessage(message)
      );
      
      const reportData = await getReport(response.report_id);
      setReport(reportData);
      
      if (reportData.report) {
        const parsed = JSON.parse(reportData.report);
        setChecklist(parsed.checklist || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze transcript');
    } finally {
      setLoading(false);
      setProgressMessage('');
    }
  };

  const scrollToTimestamp = (timestamp: string, timestamp_end?: string | null) => {
    if (timestamp_end) {
      setHighlightedRange({start: timestamp, end: timestamp_end});
    }
    
    const element = document.getElementById(`timestamp-${timestamp.replace(/:/g, '-')}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedRange(null), 3000);
    }
  };

  const resetAnalysis = () => {
    setReport(null);
    setChecklist([]);
    setTranscriptFile(null);
    setError(null);
  };

  if (report) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">OSCE Analysis Report</h1>
              <p className="text-xl text-gray-700 mt-2">
                {report.source_file || 'Unknown Source'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Report ID: {report.id} • Created: {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
            <button onClick={resetAnalysis} className="btn-secondary">
              ← New Analysis
            </button>
          </div>

          {/* Checklist Table */}
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">Critical Data Gathering & Exam Checklist</h2>
              <a href={`http://localhost:8000/reports/${report.id}/pdf`} download className="text-sm btn-primary">
                Download PDF
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-primary-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Item</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Evidence</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {checklist.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.item}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {item.status === 'Yes' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            ✓ Yes
                          </span>
                        )}
                        {item.status === 'No' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                            ✗ No
                          </span>
                        )}
                        {item.status === 'Not Sure' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                            ⚠ Not Sure
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {item.evidence ? (
                          <div>
                            <p className="italic">"{item.evidence}"</p>
                            {item.timestamp && (
                              <button
                                onClick={() => scrollToTimestamp(item.timestamp!, item.timestamp_end)}
                                className="text-xs text-primary-600 hover:text-primary-800 mt-1 underline"
                              >
                                Jump to {item.timestamp}
                                {item.timestamp_end && ` - ${item.timestamp_end}`}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transcript Viewer */}
          {report.transcript && (
            <div className="card">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Transcript</h2>
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                {report.transcript.split('\n').map((line, idx) => {
                  const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2})/);
                  const timestamp = timestampMatch ? timestampMatch[1] : null;
                  
                  let isHighlighted = false;
                  if (highlightedRange && timestamp) {
                    isHighlighted = timestamp >= highlightedRange.start && timestamp <= highlightedRange.end;
                  }
                  
                  return (
                    <div
                      key={idx}
                      id={timestamp ? `timestamp-${timestamp.replace(/:/g, '-')}` : undefined}
                      className={`py-1 px-2 rounded transition-colors ${isHighlighted ? 'bg-yellow-200' : ''}`}
                    >
                      <span className="text-xs text-gray-500 font-mono mr-2">{timestamp || ''}</span>
                      <span className="text-sm text-gray-800">{line.replace(/\[.*?\]/, '')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OSCE Analysis</h1>
          <p className="text-gray-600 mb-8">Record or upload an OSCE session for AI-powered evaluation</p>

          {error && <ErrorMessage message={error} />}

          {loading ? (
            <div className="text-center py-12">
              <LoadingSpinner />
              {progressMessage && (
                <p className="mt-4 text-sm text-gray-600">{progressMessage}</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-3">Record Audio</label>
                <AudioRecorder onRecordingComplete={handleRecordingComplete} />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-3">Upload File</label>
                <input
                  type="file"
                  accept=".txt,.mp3,.wav,.m4a,.flac,.ogg,.webm"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Transcript (.txt) or Audio (.mp3, .wav, .m4a, .flac, .ogg, .webm)
                </p>
              </div>

              {transcriptFile && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">Ready: {transcriptFile.name}</p>
                </div>
              )}

              <div>
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
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading || !transcriptFile}
                className="btn-primary w-full py-3 text-lg"
              >
                Analyze OSCE
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

