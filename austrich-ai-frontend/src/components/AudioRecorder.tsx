import { useState, useRef } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, filename: string) => void;
  onDiscard?: () => void;
}

export default function AudioRecorder({ onRecordingComplete, onDiscard }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const shouldSaveRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      shouldSaveRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use WAV format if supported, otherwise WebM
      const options = { mimeType: 'audio/webm' };
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (shouldSaveRef.current) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `osce-recording-${timestamp}.webm`;
          onRecordingComplete(audioBlob, filename);
        }
        
        stream.getTracks().forEach(track => track.stop());
        shouldSaveRef.current = true;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const discardRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      shouldSaveRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      chunksRef.current = [];
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (onDiscard) {
        onDiscard();
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
      setIsPaused(!isPaused);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6">
      <div className="flex flex-col items-center space-y-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            type="button"
            className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            <span>Start Recording</span>
          </button>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-2xl font-mono font-bold text-gray-900">
                {formatTime(recordingTime)}
              </span>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={pauseRecording}
                type="button"
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
              >
                {isPaused ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>Pause</span>
                  </>
                )}
              </button>
              <button
                onClick={stopRecording}
                type="button"
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Save</span>
              </button>
              <button
                onClick={discardRecording}
                type="button"
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Discard</span>
              </button>
            </div>
          </div>
        )}
        
        <p className="text-sm text-gray-600 text-center">
          {isRecording 
            ? 'Recording in progress... Click "Stop & Save" when finished.' 
            : 'Click "Start Recording" to begin capturing audio.'}
        </p>
      </div>
    </div>
  );
}
