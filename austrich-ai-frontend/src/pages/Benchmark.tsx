import { useState, useEffect } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

interface CaseResult {
  caseNumber: string;
  filename: string;
  transcript: string;
  reportId: string;
  duration: number;
  checklist: Array<{
    item: string;
    status: 'Yes' | 'No' | 'Not Sure';
    evidence: string | null;
    timestamp: string | null;
  }>;
}

interface ModelBenchmark {
  modelName: string;
  cases: CaseResult[];
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
}

export default function Benchmark() {
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-haiku-4-5-20251001-v1:0');
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [stats, setStats] = useState<{ totalTime: number; avgTime: number; minTime: number; maxTime: number } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (processing) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [processing]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const models = [
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude 4.5 Haiku' },
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude 4.5 Sonnet' },
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const runBenchmark = async () => {
    if (files.length === 0) {
      setError('Please select audio files first');
      return;
    }

    setProcessing(true);
    setError(null);
    setResults([]);
    setStats(null);
    setCurrentStep(`Processing ${files.length} cases in parallel...`);

    try {
      const overallStartTime = Date.now();

      // Process all files in parallel
      const results = await Promise.all(
        files.map(async (file, i) => {
          const match = file.name.match(/(\d{4})/);
          const caseNumber = match ? match[1] : String(i + 1).padStart(4, '0');
          const caseStartTime = Date.now();

          const formData = new FormData();
          formData.append('file', file);
          formData.append('model_id', selectedModel);

          const response = await fetch('http://localhost:8000/osce/upload-and-analyze', {
            method: 'POST',
            body: formData,
          });

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let reportId = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = JSON.parse(line.slice(6));
                  if (data.status === 'complete') {
                    reportId = data.report_id;
                  }
                }
              }
            }
          }

          const duration = (Date.now() - caseStartTime) / 1000;

          // Fetch report to get checklist
          const reportResponse = await fetch(`http://localhost:8000/reports/${reportId}`);
          const reportData = await reportResponse.json();
          const parsed = JSON.parse(reportData.report);

          return {
            caseNumber,
            filename: file.name,
            transcript: reportData.transcript,
            reportId,
            duration,
            checklist: parsed.checklist || [],
          };
        })
      );

      const totalTime = (Date.now() - overallStartTime) / 1000;
      const durations = results.map(r => r.duration);
      const avgTime = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minTime = Math.min(...durations);
      const maxTime = Math.max(...durations);

      setResults(results);
      setStats({ totalTime, avgTime, minTime, maxTime });
      setProcessing(false);
      setCurrentStep('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run benchmark');
      setProcessing(false);
      setCurrentStep('');
    }
  };

  const exportToCSV = () => {
    if (results.length === 0) return;

    const modelName = models.find(m => m.id === selectedModel)?.name || 'Unknown';

    // Checklist CSV
    const checklistRows: string[] = ['Item_ID,Status,Evidence,Timestamp'];
    results.forEach(caseResult => {
      caseResult.checklist.forEach((item, idx) => {
        const itemId = `${caseResult.caseNumber}${String(idx + 1).padStart(2, '0')}`;
        const evidence = item.evidence ? `"${item.evidence.replace(/"/g, '""')}"` : '';
        const timestamp = item.timestamp || '';
        checklistRows.push(`${itemId},${item.status},${evidence},${timestamp}`);
      });
    });

    const checklistCSV = checklistRows.join('\n');
    const checklistBlob = new Blob([checklistCSV], { type: 'text/csv' });
    const checklistUrl = URL.createObjectURL(checklistBlob);
    const checklistLink = document.createElement('a');
    checklistLink.href = checklistUrl;
    checklistLink.download = `benchmark-${modelName.replace(/\s+/g, '-')}-checklist.csv`;
    checklistLink.click();
    URL.revokeObjectURL(checklistUrl);

    // Timing CSV
    const timingRows: string[] = ['Case_Number,Filename,Duration_Seconds'];
    results.forEach(caseResult => {
      timingRows.push(`${caseResult.caseNumber},${caseResult.filename},${caseResult.duration.toFixed(2)}`);
    });

    const timingCSV = timingRows.join('\n');
    const timingBlob = new Blob([timingCSV], { type: 'text/csv' });
    const timingUrl = URL.createObjectURL(timingBlob);
    const timingLink = document.createElement('a');
    timingLink.href = timingUrl;
    timingLink.download = `benchmark-${modelName.replace(/\s+/g, '-')}-timing.csv`;
    timingLink.click();
    URL.revokeObjectURL(timingUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Benchmark Testing</h1>
          <p className="text-gray-600 mb-8">Upload audio files and benchmark AI model performance</p>

          {error && <ErrorMessage message={error} />}

          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">Select AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={processing}
              className="input-field"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </div>

          {/* File Selection */}
          <div className="mb-6">
            <input
              type="file"
              accept=".mp3,.wav,.m4a,.flac,.ogg,.webm"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="file-input"
              disabled={processing}
            />
            <button
              type="button"
              onClick={() => document.getElementById('file-input')?.click()}
              disabled={processing}
              className="btn-secondary"
            >
              {files.length === 0 ? 'Select Files' : 'Add More Files'}
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Select audio files (.mp3, .wav, .m4a, .flac, .ogg, .webm)
            </p>

            {files.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Selected files: {files.length}</p>
                <div className="space-y-1">
                  {files.map((file, idx) => {
                    const match = file.name.match(/(\d{4})/);
                    const caseNumber = match ? match[1] : String(idx + 1).padStart(4, '0');
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <span>Case {caseNumber}: {file.name}</span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="text-red-600 hover:text-red-800 ml-2"
                          type="button"
                          disabled={processing}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Run Button */}
          <button
            onClick={runBenchmark}
            disabled={files.length === 0 || processing}
            className="btn-primary w-full py-3 text-lg"
          >
            {processing ? 'Processing...' : 'Run Benchmark'}
          </button>

          {/* Progress */}
          {processing && (
            <div className="mt-6 text-center">
              <div className="text-5xl font-bold text-primary-600 mb-4">{formatTime(elapsedTime)}</div>
              {currentStep && (
                <p className="text-sm text-gray-600">{currentStep}</p>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && stats && (
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">
                {models.find(m => m.id === selectedModel)?.name} Results
              </h2>
              <button onClick={exportToCSV} className="btn-secondary">
                Export CSVs
              </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card text-center bg-primary-50">
                <div className="text-3xl font-bold text-primary-600 mb-1">{stats.totalTime.toFixed(2)}s</div>
                <div className="text-sm font-medium text-primary-700">Total Time</div>
              </div>
              <div className="card text-center bg-blue-50">
                <div className="text-3xl font-bold text-blue-600 mb-1">{stats.avgTime.toFixed(2)}s</div>
                <div className="text-sm font-medium text-blue-700">Average per Case</div>
              </div>
              <div className="card text-center bg-green-50">
                <div className="text-3xl font-bold text-green-600 mb-1">{stats.minTime.toFixed(2)}s</div>
                <div className="text-sm font-medium text-green-700">Fastest Case</div>
              </div>
              <div className="card text-center bg-orange-50">
                <div className="text-3xl font-bold text-orange-600 mb-1">{stats.maxTime.toFixed(2)}s</div>
                <div className="text-sm font-medium text-orange-700">Slowest Case</div>
              </div>
            </div>

            {/* Individual Case Times */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-primary-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Case</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Filename</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase">Duration</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase">Report</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((caseResult, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {caseResult.caseNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{caseResult.filename}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                        {caseResult.duration.toFixed(2)}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <a
                          href={`/report/${caseResult.reportId}`}
                          className="text-primary-600 hover:text-primary-800 text-sm underline"
                        >
                          View Report
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
