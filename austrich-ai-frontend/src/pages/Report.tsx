import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport } from '../api/client';
import type { OSCEReport } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import ConfirmDialog from '../components/ConfirmDialog';
import ToggleSwitch from '../components/ToggleSwitch';

interface ChecklistItem {
  item: string;
  status: 'Yes' | 'No' | 'Not Sure';
  evidence: string | null;
  timestamp: string | null;
  timestamp_end?: string | null;
}

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<OSCEReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [highlightedTimestamp, setHighlightedTimestamp] = useState<string | null>(null);
  const [highlightedRange, setHighlightedRange] = useState<{start: string, end: string} | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'issues' | 'review'>('all');
  const [hasChanges, setHasChanges] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    itemIndex: number;
    newStatus: 'Yes' | 'No';
  }>({ isOpen: false, itemIndex: -1, newStatus: 'Yes' });

  useEffect(() => {
    if (!id) {
      setError('Report ID is required');
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      try {
        console.log('Fetching report:', id);
        const data = await getReport(id);
        console.log('Report data:', data);
        setReport(data);
        if (data.report) {
          try {
            const parsed = JSON.parse(data.report);
            setChecklist(parsed.checklist || []);
          } catch (e) {
            console.error('Failed to parse report JSON:', e);
          }
        }
      } catch (err) {
        console.error('Error fetching report:', err);
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id]);

  const formatScore = (score: number) => {
    return `${score.toFixed(1)}%`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const scrollToTimestamp = (timestamp: string, timestamp_end?: string | null) => {
    // Clear previous highlights first
    setHighlightedTimestamp(null);
    setHighlightedRange(null);
    
    // Set new highlight
    if (timestamp_end) {
      setHighlightedRange({start: timestamp, end: timestamp_end});
    } else {
      setHighlightedTimestamp(timestamp);
    }
    
    // Try exact match first
    let element = document.getElementById(`timestamp-${timestamp.replace(/:/g, '-')}`);
    
    // If not found, find closest timestamp
    if (!element) {
      const allTimestamps = Array.from(document.querySelectorAll('[id^="timestamp-"]'));
      const targetTime = timestamp.split(':').reduce((acc, val) => acc * 60 + parseInt(val), 0);
      
      let closest = allTimestamps[0];
      let minDiff = Infinity;
      
      allTimestamps.forEach(el => {
        const ts = el.id.replace('timestamp-', '').replace(/-/g, ':');
        const time = ts.split(':').reduce((acc, val) => acc * 60 + parseInt(val), 0);
        const diff = Math.abs(time - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = el;
        }
      });
      
      element = closest as HTMLElement;
    }
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const clearHighlight = () => {
    setHighlightedTimestamp(null);
    setHighlightedRange(null);
  };

  const getStats = () => {
    const yesCount = checklist.filter(item => item.status === 'Yes').length;
    const noCount = checklist.filter(item => item.status === 'No').length;
    const notSureCount = checklist.filter(item => item.status === 'Not Sure').length;
    const score = checklist.length > 0 ? Math.round((yesCount / checklist.length) * 100) : 0;
    return { yesCount, noCount, notSureCount, score };
  };

  const getFilteredChecklist = () => {
    if (statusFilter === 'completed') return checklist.filter(item => item.status === 'Yes');
    if (statusFilter === 'issues') return checklist.filter(item => item.status === 'No');
    if (statusFilter === 'review') return checklist.filter(item => item.status === 'Not Sure');
    return checklist;
  };

  const exportToCSV = () => {
    const headers = ['#', 'Item', 'Status', 'Evidence', 'Timestamp'];
    const rows = checklist.map((item, idx) => [
      idx + 1,
      item.item.replace(/\s*\([^)]*\)/g, ''),
      item.status,
      item.evidence || '-',
      item.timestamp || '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osce-report-${report?.id || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStatusChange = (index: number, newStatus: 'Yes' | 'No') => {
    const item = checklist[index];
    if (item.status !== 'Not Sure') return;
    setConfirmDialog({ isOpen: true, itemIndex: index, newStatus });
  };

  const confirmStatusChange = () => {
    const { itemIndex, newStatus } = confirmDialog;
    const updated = [...checklist];
    updated[itemIndex] = { ...updated[itemIndex], status: newStatus };
    setChecklist(updated);
    setHasChanges(true);
    setConfirmDialog({ isOpen: false, itemIndex: -1, newStatus: 'Yes' });
  };

  const cancelStatusChange = () => {
    setConfirmDialog({ isOpen: false, itemIndex: -1, newStatus: 'Yes' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ErrorMessage
            message={error || 'Report not found'}
            onRetry={() => id && window.location.reload()}
          />
          <button onClick={() => navigate('/')} className="btn-secondary mt-4">
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-primary-600 hover:text-primary-700 font-medium mb-4"
          >
            ← Back to Home
          </button>
          <h1 className="text-3xl font-bold text-gray-900">OSCE Analysis Report</h1>
          <p className="text-gray-600 mt-2">
            Report ID: {report.id} • Created: {new Date(report.created_at).toLocaleString()}
          </p>
          {hasChanges && (
            <p className="text-sm text-orange-600 mt-1 font-medium">
              ⚠ You have unsaved manual changes
            </p>
          )}
        </div>

        {/* If text report exists, display it as markdown */}
        {report.report ? (
          <>
            {/* Summary Statistics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card text-center bg-emerald-50">
                <div className="text-3xl font-bold text-emerald-600 mb-1">{getStats().yesCount}</div>
                <div className="text-sm font-medium text-emerald-700">✓ Completed</div>
              </div>
              <div className="card text-center bg-rose-50">
                <div className="text-3xl font-bold text-rose-600 mb-1">{getStats().noCount}</div>
                <div className="text-sm font-medium text-rose-700">✗ Issues</div>
              </div>
              <div className="card text-center bg-amber-50">
                <div className="text-3xl font-bold text-amber-700 mb-1">{getStats().notSureCount}</div>
                <div className="text-sm font-medium text-amber-800">⚠ Needs Review</div>
              </div>
              <div className="card text-center bg-primary-50">
                <div className="text-3xl font-bold text-primary-600 mb-1">{getStats().score}%</div>
                <div className="text-sm font-medium text-primary-700">Overall Score</div>
              </div>
            </div>

            {/* Checklist Table */}
            <div className="card mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-900">Critical Data Gathering & Exam Checklist</h2>
                <div className="flex space-x-2">
                  <button onClick={exportToCSV} className="btn-secondary">
                    Export CSV
                  </button>
                  <a
                    href={`http://localhost:8000/reports/${report.id}/pdf`}
                    download
                    className="btn-primary"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
              
              {/* Filter Buttons */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Show All ({checklist.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('completed')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'completed'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Completed ({getStats().yesCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('issues')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'issues'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Issues ({getStats().noCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('review')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'review'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Needs Review ({getStats().notSureCount})
                  </button>
                </div>
                
                {/* Review Mode Toggle */}
                <ToggleSwitch
                  checked={reviewMode}
                  onChange={setReviewMode}
                  label={reviewMode ? '✓ Review Mode Active' : 'Enable Review Mode'}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-primary-600">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getFilteredChecklist().map((item) => {
                      const originalIdx = checklist.indexOf(item);
                      return (
                      <tr key={originalIdx} className={originalIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {originalIdx + 1}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.item.replace(/\s*\([^)]*\)/g, '')}
                        </td>
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
                            <div className="flex items-center justify-center space-x-2">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                                ⚠ Not Sure
                              </span>
                              {reviewMode && (
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => handleStatusChange(originalIdx, 'Yes')}
                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                    title="Mark as Yes"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(originalIdx, 'No')}
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                    title="Mark as No"
                                  >
                                    ✗
                                  </button>
                                </div>
                              )}
                            </div>
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
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transcript Viewer */}
            {report.transcript && (
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold text-gray-900">Transcript</h2>
                  {(highlightedRange || highlightedTimestamp) && (
                    <button onClick={clearHighlight} className="text-sm text-gray-600 hover:text-gray-800">
                      Clear Highlight
                    </button>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  {report.transcript.split('\n').map((line, idx) => {
                    const timestampMatch = line.match(/\[(\d{2}:\d{2}:\d{2})/);  
                    const timestamp = timestampMatch ? timestampMatch[1] : null;
                    
                    let isHighlighted = false;
                    if (highlightedRange && timestamp) {
                      isHighlighted = timestamp >= highlightedRange.start && timestamp <= highlightedRange.end;
                    } else if (timestamp && highlightedTimestamp === timestamp) {
                      isHighlighted = true;
                    }
                    
                    return (
                      <div
                        key={idx}
                        id={timestamp ? `timestamp-${timestamp.replace(/:/g, '-')}` : undefined}
                        className={`py-1 px-2 rounded transition-colors ${
                          isHighlighted ? 'bg-yellow-200' : ''
                        }`}
                      >
                        <span className="text-xs text-gray-500 font-mono mr-2">
                          {timestamp || ''}
                        </span>
                        <span className="text-sm text-gray-800">{line.replace(/\[.*?\]/, '')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Original structured view */}
        <div className="card mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Overall Score</h2>
          <div className="flex items-center">
            <div className={`text-5xl font-bold ${getScoreColor(report.overall_score)}`}>
              {formatScore(report.overall_score)}
            </div>
            <div className="ml-6">
              <div className="w-64 bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full ${
                    report.overall_score >= 80
                      ? 'bg-green-500'
                      : report.overall_score >= 60
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${report.overall_score}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Clinical Knowledge */}
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Clinical Knowledge
            </h3>
            <div className={`text-3xl font-bold mb-4 ${getScoreColor(report.clinical_knowledge.score)}`}>
              {formatScore(report.clinical_knowledge.score)}
            </div>
            <ul className="space-y-2">
              {report.clinical_knowledge.feedback.map((item, idx) => (
                <li key={idx} className="text-gray-700 flex items-start">
                  <span className="text-primary-600 mr-2">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Communication */}
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Communication
            </h3>
            <div className={`text-3xl font-bold mb-4 ${getScoreColor(report.communication.score)}`}>
              {formatScore(report.communication.score)}
            </div>
            <ul className="space-y-2">
              {report.communication.feedback.map((item, idx) => (
                <li key={idx} className="text-gray-700 flex items-start">
                  <span className="text-primary-600 mr-2">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Physical Exam */}
        <div className="card mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Physical Examination
          </h3>
          <div className={`text-3xl font-bold mb-4 ${getScoreColor(report.physical_exam.score)}`}>
            {formatScore(report.physical_exam.score)}
          </div>
          <ul className="space-y-2">
            {report.physical_exam.feedback.map((item, idx) => (
              <li key={idx} className="text-gray-700 flex items-start">
                <span className="text-primary-600 mr-2">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Checklist Results */}
        <div className="card mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Checklist Results
          </h3>
          <div className="space-y-3">
            {report.checklist_results.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-start p-3 rounded-lg border ${
                  item.completed
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {item.completed ? (
                    <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <p className={`font-medium ${item.completed ? 'text-green-900' : 'text-red-900'}`}>
                    {item.item}
                  </p>
                  {item.notes && (
                    <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timestamped Feedback */}
        {report.timestamped_feedback.length > 0 && (
          <div className="card mb-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Timestamped Feedback
            </h3>
            <div className="space-y-4">
              {report.timestamped_feedback.map((feedback, idx) => (
                <div key={idx} className="border-l-4 border-primary-500 pl-4">
                  <div className="flex items-center mb-2">
                    <span className="text-sm font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                      {formatTimestamp(feedback.timestamp)}
                    </span>
                    <span className="ml-3 text-xs text-gray-500 capitalize">
                      {feedback.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-gray-700">{feedback.feedback}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missed Critical Actions */}
        {report.missed_critical_actions.length > 0 && (
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 text-red-600">
              Missed Critical Actions
            </h3>
            <ul className="space-y-2">
              {report.missed_critical_actions.map((action, idx) => (
                <li key={idx} className="text-gray-700 flex items-start">
                  <span className="text-red-600 mr-2">⚠</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/analyze')}
            className="btn-primary"
          >
            Analyze Another OSCE
          </button>
        </div>
        </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Confirm Status Change"
        message={`Change status from "Not Sure" to "${confirmDialog.newStatus}" for item #${confirmDialog.itemIndex + 1}?\n\nThis will mark the item as manually reviewed.`}
        onConfirm={confirmStatusChange}
        onCancel={cancelStatusChange}
        confirmText={`Mark as ${confirmDialog.newStatus}`}
        confirmColor={confirmDialog.newStatus === 'Yes' ? 'green' : 'red'}
      />
    </div>
  );
}

