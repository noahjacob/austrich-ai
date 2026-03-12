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
  { id: 'us.meta.llama4-maverick-17b-instruct-v1:0', name: 'Llama 4 Maverick' },
  { id: 'us.meta.llama4-scout-17b-instruct-v1:0', name: 'Llama 4 Scout' },
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

    try {
      const allResults = await Promise.all(files.map(file => transcribeFile(file)));
      setResults(allResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setProcessing(false);
    }
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

    try {
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

      const allResults: AnalysisResult[] = [];
      let isComplete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream ended, total results:', allResults.length);
          break;
        }

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(trimmed.slice(6));
            console.log('SSE message:', data.status, data.message || '');
            
            if (data.status === 'data') {
              allResults.push(...data.results);
              setAnalysisResults([...allResults]);
              console.log('Accumulated results:', allResults.length);
            } else if (data.status === 'complete') {
              isComplete = true;
              console.log('Analysis complete!');
            } else if (data.status === 'error') {
              setError(data.message);
            }
          } catch (e) {
            console.error('Failed to parse SSE line:', trimmed, e);
          }
        }
      }

      // Final update
      setAnalysisResults(allResults);
      console.log('Setting final results:', allResults.length);
      
      // Auto-export CSVs if analysis completed successfully
      if (isComplete && allResults.length > 0) {
        console.log('Auto-exporting CSVs...');
        setTimeout(() => {
          exportAnalysisTimesToCSV();
          setTimeout(() => exportAnalysisToCSV(), 200);
        }, 500);
      }
      
    } catch (e) {
      console.error('Analysis error:', e);
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      console.log('Setting analyzing to false');
      setAnalyzing(false);
    }
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

  const exportAllCSVs = () => {
    exportAnalysisTimesToCSV();
    setTimeout(() => exportAnalysisToCSV(), 100);
  };

  const exportAnalysisTimesToCSV = () => {
    const filenames = [...new Set(analysisResults.map(r => r.transcript_key))];
    const models = [...new Set(analysisResults.map(r => r.model_id))];
    
    const headers = ['Case', ...models.map(m => MODELS.find(model => model.id === m)?.name || m)];
    
    const rows = filenames.map(filename => {
      const row = [filename];
      models.forEach(modelId => {
        const result = analysisResults.find(r => r.transcript_key === filename && r.model_id === modelId);
        row.push(result ? result.analysis_time.toFixed(2) : '-');
      });
      return row;
    });

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

    // First 10 checklist items with sub-items: 1, 2, 2a-2e, 3, 4, 4a-4d, 5, 5a-5e, 6, 7, 8, 9, 10
    const CHECKLIST_ITEMS = [
      '1', '2', '2a', '2b', '2c', '2d', '2e', '3',
      '4', '4a', '4b', '4c', '4d',
      '5', '5a', '5b', '5c', '5d', '5e',
      '6', '7', '8', '9', '10'
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
                // Check if we're looking for a sub-item (e.g., '2a', '4b')
                if (itemNum.match(/^\d+[a-z]$/)) {
                  const subItem = item.subitems.find(s => {
                    const match = s.item.match(/^(\d+[a-z])\./); 
                    return match && match[1] === itemNum;
                  });
                  if (subItem) {
                    status = subItem.status;
                    break;
                  }
                } else {
                  // Looking for parent item (e.g., '2', '4', '5')
                  const match = item.item.match(/^(\d+)\./); 
                  if (match && match[1] === itemNum) {
                    status = item.overall_status || 'MISSING';
                    break;
                  }
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
              {analyzing ? `Analyzing... (${analysisResults.length} completed)` : `Analyze (${transcriptFiles.length} × ${selectedModels.length} = ${transcriptFiles.length * selectedModels.length} runs)`}
            </button>
          </div>

          {analysisResults.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  Analysis Complete ({analysisResults.length} results)
                </h3>
                <div className="flex space-x-2">
                  <button onClick={exportAnalysisTimesToCSV} className="btn-secondary text-sm">
                    Export Times CSV
                  </button>
                  <button onClick={exportAnalysisToCSV} className="btn-secondary text-sm">
                    Export Results CSV
                  </button>
                  <button onClick={exportAnalysisToJSON} className="btn-secondary text-sm">
                    Export JSON
                  </button>
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  ✓ {analysisResults.length} analyses completed successfully. Export timing and results data using the buttons above.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
