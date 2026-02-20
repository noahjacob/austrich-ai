import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Tabs from '../components/Tabs';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { analyzeTranscript, analyzeVideo, listS3InputFiles, analyzeFromS3, deleteS3InputFile } from '../api/client';

const FILES_PER_PAGE = 5;

export default function Analyze() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'transcript' | 'video'>('transcript');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transcript state
  const [transcript, setTranscript] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<'manual' | 's3'>('manual');
  const [s3Files, setS3Files] = useState<Array<{ key: string; size: number; last_modified: string }>>([]);
  const [selectedS3File, setSelectedS3File] = useState<string>('');
  const [loadingS3Files, setLoadingS3Files] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-haiku-4-5-20251001-v1:0');
  const [selectedPrompt, setSelectedPrompt] = useState('prompt');
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [timestamp, setTimestamp] = useState('');

  const models = [
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude 4.5 Haiku' },
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude 4.5 Sonnet' },
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
  ];

  const prompts = [
    { id: 'prompt', name: 'Standard OSCE Prompt' },
    { id: 'checklist_prompt', name: 'Checklist Prompt' },
  ];

  useEffect(() => {
    if (activeTab === 'transcript') {
      loadS3Files();
    }
  }, [activeTab]);

  const loadS3Files = async () => {
    setLoadingS3Files(true);
    try {
      const response = await listS3InputFiles();
      setS3Files(response.files);
    } catch (err) {
      console.error('Failed to load S3 files:', err);
    } finally {
      setLoadingS3Files(false);
    }
  };

  const handleDeleteS3File = async (fileKey: string) => {
    if (!confirm(`Delete ${fileKey}?`)) return;
    
    try {
      await deleteS3InputFile(fileKey);
      await loadS3Files(); // Refresh list
      if (selectedS3File === fileKey) {
        setSelectedS3File('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  // Filter and paginate files
  const filteredFiles = s3Files.filter(file => 
    file.key.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredFiles.length / FILES_PER_PAGE);
  const paginatedFiles = filteredFiles.slice(
    (currentPage - 1) * FILES_PER_PAGE,
    currentPage * FILES_PER_PAGE
  );

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
    
    if (transcriptSource === 's3' && !selectedS3File) {
      setError('Please select a file from S3');
      return;
    }
    
    if (transcriptSource === 'manual' && !transcript.trim()) {
      setError('Please enter or upload a transcript');
      return;
    }

    setLoading(true);
    setError(null);
    setBatchProgress(null);

    try {
      let response;
      if (transcriptSource === 's3') {
        response = await analyzeFromS3(
          selectedS3File,
          selectedModel,
          batchCount,
          (message) => setBatchProgress(message),
          selectedPrompt
        );
      } else {
        response = await analyzeTranscript({ transcript, model_id: selectedModel, prompt_name: selectedPrompt });
      }
      navigate(`/reports/${response.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze transcript');
    } finally {
      setLoading(false);
      setBatchProgress(null);
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

          {batchProgress && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">
                {batchProgress}
              </p>
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {activeTab === 'transcript' && (
                <form onSubmit={handleTranscriptSubmit} className="mt-6">
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Transcript Source
                    </label>
                    <div className="flex gap-4 mb-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="manual"
                          checked={transcriptSource === 'manual'}
                          onChange={(e) => setTranscriptSource(e.target.value as 'manual' | 's3')}
                          className="mr-2"
                        />
                        Manual Input / Upload File
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="s3"
                          checked={transcriptSource === 's3'}
                          onChange={(e) => setTranscriptSource(e.target.value as 'manual' | 's3')}
                          className="mr-2"
                        />
                        Select from S3
                      </label>
                    </div>
                  </div>

                  {transcriptSource === 'manual' ? (
                    <>
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
                    </>
                  ) : (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Transcript from S3
                      </label>
                      {loadingS3Files ? (
                        <p className="text-gray-600">Loading files...</p>
                      ) : (
                        <>
                          {s3Files.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No files found. Upload files to austrich-ai-input bucket.
                            </p>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => {
                                  setSearchQuery(e.target.value);
                                  setCurrentPage(1);
                                }}
                                className="input-field mb-3"
                              />
                              <div className="space-y-2 mb-3 max-h-96 overflow-y-auto border rounded-lg p-3">
                                {paginatedFiles.length === 0 ? (
                                  <p className="text-sm text-gray-500">No files match your search.</p>
                                ) : (
                                  paginatedFiles.map((file) => (
                                    <div
                                      key={file.key}
                                      className={`flex items-center justify-between p-3 rounded border cursor-pointer hover:bg-gray-50 ${
                                        selectedS3File === file.key ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                                      }`}
                                      onClick={() => setSelectedS3File(file.key)}
                                    >
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{file.key}</p>
                                        <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteS3File(file.key);
                                        }}
                                        className="ml-3 text-red-600 hover:text-red-800"
                                        title="Delete file"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between text-sm">
                                  <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="btn-secondary disabled:opacity-50"
                                  >
                                    Previous
                                  </button>
                                  <span className="text-gray-600">
                                    Page {currentPage} of {totalPages} ({filteredFiles.length} files)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="btn-secondary disabled:opacity-50"
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={loadS3Files}
                            className="btn-secondary mt-3"
                          >
                            Refresh Files
                          </button>
                        </>
                      )}
                    </div>
                  )}

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

                  <div className="mb-6">
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                      Prompt
                    </label>
                    <select
                      id="prompt"
                      value={selectedPrompt}
                      onChange={(e) => setSelectedPrompt(e.target.value)}
                      className="input-field"
                    >
                      {prompts.map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>
                          {prompt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {transcriptSource === 's3' && (
                    <div className="mb-6">
                      <label htmlFor="batch" className="block text-sm font-medium text-gray-700 mb-2">
                        Batch Run (1-10 runs)
                      </label>
                      <input
                        id="batch"
                        type="number"
                        min="1"
                        max="10"
                        value={batchCount}
                        onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                        className="input-field"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        Run the same transcript multiple times for consistency testing
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || (transcriptSource === 'manual' ? !transcript.trim() : !selectedS3File)}
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

