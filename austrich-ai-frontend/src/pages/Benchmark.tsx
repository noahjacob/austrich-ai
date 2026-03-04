import { useState } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

interface TranscriptionResult {
  filename: string;
  transcription_time: number;
  transcript_key: string;
  transcript_length: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface AnalysisResult {
  transcript_key: string;
  model_id: string;
  analysis_time: number;
  checklist?: Array<{
    item: string;
    status?: string;
    overall_status?: string;
    has_subitems?: boolean;
    subitems?: Array<{
      item: string;
      status: string;
    }>;
  }>;
}

const MODELS = [
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude 4.5 Haiku' },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude 4.5 Sonnet' },
  { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
];

export default function Benchmark() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<TranscriptionResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(MODELS.map(m => m.id));
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'webm'].includes(ext || '');
    });
    
    if (validFiles.length !== selectedFiles.length) {
      setError('Some files were skipped (invalid format)');
    } else {
      setError(null);
    }
    
    setFiles(validFiles);
  };

  const transcribeFile = async (file: File): Promise<TranscriptionResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('http://localhost:8000/benchmark/transcribe', {
      method: 'POST',
      body: formData,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let result: TranscriptionResult = {
      filename: file.name,
      transcription_time: 0,
      transcript_key: '',
      transcript_length: 0,
      status: 'processing'
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          
          if (data.status === 'complete') {
            result = {
              filename: data.filename,
              transcription_time: data.transcription_time,
              transcript_key: data.transcript_key,
              transcript_length: data.transcript_length,
              status: 'complete'
            };
          } else if (data.status === 'error') {
            result.status = 'error';
            result.error = data.message;
          }
        }
      }
    }

    return result;
  };

  const handleTranscribe = async () => {
    if (files.length === 0) {
      setError('Please select audio files first');
      return;
    }

    setProcessing(true);
    setError(null);
    setResults(files.map(file => ({
      filename: file.name,
      transcription_time: 0,
      transcript_key: '',
      transcript_length: 0,
      status: 'processing' as const
    })));

    const allResults = await Promise.all(files.map(file => transcribeFile(file)));
    setResults(allResults);
    setProcessing(false);
  };

  const exportToCSV = () => {
    const headers = ['Filename', 'Transcription Time (s)', 'Transcript Length (chars)', 'Transcript Key', 'Status'];
    const rows = results.map(r => [
      r.filename,
      r.transcription_time.toFixed(2),
      r.transcript_length.toString(),
      r.transcript_key,
      r.status === 'error' ? `Error: ${r.error}` : r.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-benchmark-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAnalyze = async () => {
    if (transcriptFiles.length === 0 || selectedModels.length === 0) {
      setError('Please upload transcript files and select models');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAnalysisResults([]);

    const formData = new FormData();
    transcriptFiles.forEach(file => formData.append('files', file));
    selectedModels.forEach(m => formData.append('model_ids', m));

    const response = await fetch('http://localhost:8000/benchmark/analyze', {
      method: 'POST',
      body: formData,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      setError('No response body');
      setAnalyzing(false);
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          
          if (data.status === 'complete') {
            setAnalysisResults(data.results);
          } else if (data.status === 'error') {
            setError(data.message);
          }
        }
      }
    }

    setAnalyzing(false);
  };

  const exportAnalysisToJSON = () => {
    const blob = new Blob([JSON.stringify(analysisResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-benchmark-raw-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAnalysisTimesToCSV = () => {
    const headers = ['Filename', 'Model', 'Analysis Time (s)'];
    const rows = analysisResults.map(r => [
      r.transcript_key,
      MODELS.find(m => m.id === r.model_id)?.name || r.model_id,
      r.analysis_time.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-times-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAnalysisToCSV = () => {
    if (analysisResults.length === 0) return;

    // Fixed list of all checklist items
    const CHECKLIST_ITEMS = [
      '1', '2a', '2b', '2c', '2d', '2e', '3',
      '4a', '4b', '4c', '4d',
      '5a', '5b', '5c', '5d', '5e', '5f',
      '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
    ];

    // Extract case number from filename
    const getCaseNumber = (filename: string) => {
      const match = filename.match(/(\d{4})/);
      return match ? match[1] : '0000';
    };

    // Get unique filenames and models
    const filenames = [...new Set(analysisResults.map(r => r.transcript_key))];
    const models = [...new Set(analysisResults.map(r => r.model_id))];

    // Build headers
    const headers = ['Case #', ...models.map(m => MODELS.find(model => model.id === m)?.name || m)];

    // Build rows for each file
    const rows: string[][] = [];
    filenames.forEach(filename => {
      const caseNum = getCaseNumber(filename);
      
      CHECKLIST_ITEMS.forEach(itemNum => {
        const caseId = `${caseNum}${itemNum}`;
        const row = [caseId];
        
        models.forEach(modelId => {
          const result = analysisResults.find(r => r.transcript_key === filename && r.model_id === modelId);
          let status = 'MISSING';
          
          if (result?.checklist) {
            for (const item of result.checklist) {
              if (item.has_subitems && item.subitems) {
                const subItem = item.subitems.find(s => {
                  const match = s.item.match(/^(\d+[a-z])\./); 
                  return match && match[1] === itemNum;
                });
                if (subItem) {
                  status = subItem.status;
                  break;
                }
              } else {
                const match = item.item.match(/^(\d+)\./); 
                if (match && match[1] === itemNum) {
                  status = item.status || item.overall_status || 'MISSING';
                  break;
                }
              }
            }
          }
          
          row.push(status);
        });
        
        rows.push(row);
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-benchmark-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Transcription Benchmark</h1>
          <p className="text-gray-600 mb-8">Upload audio files to transcribe and measure performance</p>

          {error && <ErrorMessage message={error} />}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">Select Audio Files</label>
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.flac,.ogg,.webm"
                multiple
                onChange={handleFileChange}
                disabled={processing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
              />
              <p className="mt-2 text-xs text-gray-500">
                Audio formats: .mp3, .wav, .m4a, .flac, .ogg, .webm
              </p>
            </div>

            {files.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </p>
                <ul className="mt-2 text-xs text-blue-700 space-y-1">
                  {files.map((file, idx) => (
                    <li key={idx}>• {file.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleTranscribe}
              disabled={processing || files.length === 0}
              className="btn-primary w-full py-3 text-lg disabled:opacity-50"
            >
              {processing ? 'Transcribing...' : 'Start Transcription'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Results</h2>
                {results.some(r => r.status === 'complete') && (
                  <button onClick={exportToCSV} className="btn-secondary text-sm">
                    Export CSV
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-primary-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Filename</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Time (s)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Length</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.map((result, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="px-6 py-4 text-sm text-gray-900">{result.filename}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {result.status === 'complete' ? result.transcription_time.toFixed(2) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {result.status === 'complete' ? result.transcript_length.toLocaleString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {result.status === 'processing' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Processing...
                            </span>
                          )}
                          {result.status === 'complete' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✓ Complete
                            </span>
                          )}
                          {result.status === 'error' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              ✗ Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Benchmark Section */}
        <div className="card mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Model Analysis Benchmark</h2>
          <p className="text-gray-600 mb-6">Analyze transcripts with multiple models in parallel</p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">Upload Transcript Files</label>
              <input
                type="file"
                accept=".txt"
                multiple
                onChange={(e) => {
                  const selectedFiles = Array.from(e.target.files || []);
                  setTranscriptFiles(selectedFiles);
                }}
                disabled={analyzing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
              />
              <p className="mt-2 text-xs text-gray-500">
                Upload .txt transcript files
              </p>
            </div>

            {transcriptFiles.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">
                  {transcriptFiles.length} file{transcriptFiles.length > 1 ? 's' : ''} selected
                </p>
                <ul className="mt-2 text-xs text-blue-700 space-y-1">
                  {transcriptFiles.map((file, idx) => (
                    <li key={idx}>• {file.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">Select Models</label>
              <div className="space-y-2">
                {MODELS.map(model => (
                  <label key={model.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedModels([...selectedModels, model.id]);
                        } else {
                          setSelectedModels(selectedModels.filter(m => m !== model.id));
                        }
                      }}
                      disabled={analyzing}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{model.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || transcriptFiles.length === 0 || selectedModels.length === 0}
              className="btn-primary w-full py-3 text-lg disabled:opacity-50"
            >
              {analyzing ? 'Analyzing...' : `Analyze (${transcriptFiles.length} × ${selectedModels.length} = ${transcriptFiles.length * selectedModels.length} runs)`}
            </button>
          </div>

          {analysisResults.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Analysis Results</h3>
                <div className="flex space-x-2">
                  <button onClick={exportAnalysisTimesToCSV} className="btn-secondary text-sm">
                    Export Times CSV
                  </button>
                  <button onClick={exportAnalysisToJSON} className="btn-secondary text-sm">
                    Export JSON
                  </button>
                  <button onClick={exportAnalysisToCSV} className="btn-secondary text-sm">
                    Export Results CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-primary-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Filename</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Model</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Time (s)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analysisResults.map((result, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="px-6 py-4 text-sm text-gray-900">{result.transcript_key}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {MODELS.find(m => m.id === result.model_id)?.name || result.model_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{result.analysis_time.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
