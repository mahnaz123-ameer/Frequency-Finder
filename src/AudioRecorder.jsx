import React, { useEffect, useState, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

const AudioRecorder = () => {
  const [scrollingWaveform, setScrollingWaveform] = useState(false);
  const [continuousWaveform, setContinuousWaveform] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [dominantFrequency, setDominantFrequency] = useState(null);
  const [frequencyWarning, setFrequencyWarning] = useState(false);

  const wavesurferRef = useRef(null);
  const recordRef = useRef(null);
  const micSelectRef = useRef(null);
  const progressRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    const createWaveSurfer = () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      // Create a new Wavesurfer instance
      const wavesurfer = WaveSurfer.create({
        container: '#mic',
        waveColor: 'rgb(200, 0, 200)',
        progressColor: 'rgb(100, 0, 100)',
      });

      // Initialize the Record plugin
      const record = wavesurfer.registerPlugin(
        RecordPlugin.create({
          renderRecordedAudio: false,
          scrollingWaveform,
          continuousWaveform,
          continuousWaveformDuration: 30,
        })
      );

      recordRef.current = record;

      record.on('record-end', (blob) => {
        const container = document.querySelector('#recordings');
        const recordedUrl = URL.createObjectURL(blob);
      
        // Create wavesurfer for the recorded audio
        const recordedWaveSurfer = WaveSurfer.create({
          container,
          waveColor: 'rgb(200, 100, 0)',
          progressColor: 'rgb(100, 50, 0)',
          url: recordedUrl,
        });
      
        // Append the Play button
        const playButton = container.appendChild(document.createElement('button'));
        playButton.textContent = 'Play';
        playButton.className =
          'bg-blue-500 text-white px-4 py-2 rounded-lg mb-2 mr-2 hover:bg-blue-600 transition';
        playButton.onclick = () => {
          recordedWaveSurfer.playPause();
        };
      
        recordedWaveSurfer.on('pause', () => (playButton.textContent = 'Play'));
        recordedWaveSurfer.on('play', () => (playButton.textContent = 'Pause'));
      
        // Append the Download link below the Play button
        const downloadLink = container.appendChild(document.createElement('a'));
        Object.assign(downloadLink, {
          href: recordedUrl,
          download: 'recording.' + blob.type.split(';')[0].split('/')[1] || 'webm',
          textContent: 'Download recording',
        });
        downloadLink.className =
          'bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition';
      });
      

      wavesurferRef.current = wavesurfer;

      // Update progress during recording
      record.on('record-progress', (time) => {
        const formattedTime = [
          Math.floor((time % 3600000) / 60000),
          Math.floor((time % 60000) / 1000),
        ]
          .map((v) => (v < 10 ? '0' + v : v))
          .join(':');
        progressRef.current.textContent = formattedTime;
      });
    };

    createWaveSurfer();

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, [scrollingWaveform, continuousWaveform]);

  const startRecording = async (deviceId) => {
    if (audioContextRef.current) {
      audioContextRef.current.close(); // Close existing AudioContext if any
    }

    // Create new AudioContext
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    // Get the microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId },
    });

    // Create media stream source from the microphone
    const source = audioContext.createMediaStreamSource(stream);
    
    // Create an analyser node
    analyserRef.current = audioContext.createAnalyser();
    source.connect(analyserRef.current);

    // Perform FFT analysis during recording
    performFFTAnalysis();

    // Start the recording
    recordRef.current.startRecording({ deviceId }).then(() => {
      setIsRecording(true);
    });
  };

  const performFFTAnalysis = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const getDominantFrequency = () => {
      analyserRef.current.getByteFrequencyData(dataArray);

      // Find the index with the maximum frequency value
      let maxVal = -1;
      let maxIndex = -1;

      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxVal) {
          maxVal = dataArray[i];
          maxIndex = i;
        }
      }

      // Calculate frequency based on the index
      const sampleRate = analyserRef.current.context.sampleRate;
      const dominantFrequencyValue = (maxIndex * sampleRate) / (2 * bufferLength);
      
      setDominantFrequency(dominantFrequencyValue);

      // Set warning if frequency is less than 250 Hz
      if (dominantFrequencyValue < 250) {
        setFrequencyWarning(true);
      } else {
        setFrequencyWarning(false);
      }
    };

    // Update frequency every 100ms
    setInterval(getDominantFrequency, 100);
  };

  // Record Button
  const handleRecordClick = () => {
    if (isRecording || isPaused) {
      recordRef.current.stopRecording();
      setIsRecording(false);
      setIsPaused(false);
    } else {
      const deviceId = micSelectRef.current.value;
      startRecording(deviceId); // Start recording with the selected microphone device
    }
  };

  // Pause Button
  const handlePauseClick = () => {
    if (isPaused) {
      recordRef.current.resumeRecording();
      setIsPaused(false);
    } else {
      recordRef.current.pauseRecording();
      setIsPaused(true);
    }
  };

  // Audio selector
  useEffect(() => {
    // Fetch available audio devices for mic selection
    RecordPlugin.getAvailableAudioDevices().then((devices) => {
      devices.forEach((device) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || device.deviceId;
        micSelectRef.current.appendChild(option);
      });
    });
  }, []);

  return (
    <div className="flex flex-col items-center p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-800 mt-4">
        Press Record to start recording 🎙️
      </h1>

      <div className="flex gap-4 mt-6">
        <button
          id="record"
          onClick={handleRecordClick}
          className={`px-4 py-2 rounded-lg text-white ${
            isRecording ? 'bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
          } focus:outline-none`}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>
        <button
          id="pause"
          onClick={handlePauseClick}
          className={`px-4 py-2 rounded-lg text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none ${
            isRecording ? 'block' : 'hidden'
          }`}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>

      <select
        ref={micSelectRef}
        id="mic-select"
        className="mt-4 p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring focus:ring-blue-300"
      >
        <option value="" hidden>
          Select mic
        </option>
      </select>

      <div className="mt-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="scrollingWaveform"
            checked={scrollingWaveform}
            onChange={(e) => setScrollingWaveform(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring focus:ring-blue-300"
          />
          <span className="text-gray-700">Scrolling waveform</span>
        </label>

        <label className="flex items-center space-x-2 mt-2">
          <input
            type="checkbox"
            id="continuousWaveform"
            checked={continuousWaveform}
            onChange={(e) => setContinuousWaveform(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring focus:ring-blue-300"
          />
          <span className="text-gray-700">Continuous waveform</span>
        </label>
      </div>

      <div className="mt-6 w-full max-w-3xl">
        <div id="mic" className="w-full h-24 bg-gray-200 rounded-lg"></div>
      </div>

      <div id="recordings" className="mt-6 w-full max-w-3xl space-y-4"></div>

      <p ref={progressRef} id="recording-progress" className="text-gray-500 mt-4"></p>

      <div className="mt-6">
        <h3 className="text-lg text-gray-800">
          Frequency: {dominantFrequency ? `${dominantFrequency.toFixed(2)} Hz` : 'N/A'}
        </h3>
        {frequencyWarning && (
          <p className="text-red-600 mt-2">Warning: Frequency is too low (below 250 Hz)</p>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;