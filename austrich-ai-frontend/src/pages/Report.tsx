import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport } from '../api/client';
import type { OSCEReport } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<OSCEReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        </div>

        {/* If text report exists, display it as markdown */}
        {report.report ? (
          <div className="card">
            <div className="prose max-w-none" style={{ whiteSpace: 'pre-wrap' }}>
              {report.report}
            </div>
            {report.transcript && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Original Transcript</h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                    {report.transcript}
                  </pre>
                </div>
              </div>
            )}
          </div>
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
    </div>
  );
}

