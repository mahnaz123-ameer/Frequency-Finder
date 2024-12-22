import React, { useEffect, useState, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

const AudioRecorder = () => {
  const [scrollingWaveform, setScrollingWaveform] = useState(false);
  const [continuousWaveform, setContinuousWaveform] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [dominantFrequency, setDominantFrequency] = useState(null);
  const [frequencyWarning, setFrequencyWarning] = useState(false); // To track low frequency warning
  
  const wavesurferRef = useRef(null);
  const recordRef = useRef(null);
  const micSelectRef = useRef(null);
  const progressRef = useRef(null);
  const analyserRef = useRef(null); // Ref to store AnalyserNode
  const audioContextRef = useRef(null); // Ref to store AudioContext

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

      // Render recorded audio
      record.on('record-end', (blob) => {
        const container = document.querySelector('#recordings');
        const recordedUrl = URL.createObjectURL(blob);

        // Create wavesurfer from the recorded audio
        const recordedWaveSurfer = WaveSurfer.create({
          container,
          waveColor: 'rgb(200, 100, 0)',
          progressColor: 'rgb(100, 50, 0)',
          url: recordedUrl,
        });

        recordedWaveSurfer.on('ready', () => {
          // After the recording is ready, perform FFT analysis
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createBufferSource();
          
          // Decode audio data and setup FFT analysis
          fetch(recordedUrl)
            .then(response => response.arrayBuffer())
            .then(data => {
              audioContext.decodeAudioData(data, (buffer) => {
                source.buffer = buffer;
                source.connect(audioContext.destination);
                
                // Create an analyser node
                analyserRef.current = audioContext.createAnalyser();
                source.connect(analyserRef.current);
                
                // Start playing the audio
                source.start();
                
                // Perform FFT analysis
                performFFTAnalysis();
              });
            });
        });

        // Play/Pause button
        const button = container.appendChild(document.createElement('button'));
        button.textContent = 'Play';
        button.onclick = () => {
          recordedWaveSurfer.playPause();
          // Perform FFT analysis when play button is clicked
          if (recordedWaveSurfer.isPlaying()) {
            source.start();
            performFFTAnalysis();
          }
        };

        recordedWaveSurfer.on('pause', () => (button.textContent = 'Play'));
        recordedWaveSurfer.on('play', () => {
          button.textContent = 'Pause';
          // Perform FFT analysis when the audio starts playing
          source.start();
          performFFTAnalysis();
        });

        // Download link
        const link = container.appendChild(document.createElement('a'));
        Object.assign(link, {
          href: recordedUrl,
          download: 'recording.' + blob.type.split(';')[0].split('/')[1] || 'webm',
          textContent: 'Download recording',
        });
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
    <div>
      <h1 style={{ marginTop: 0 }}>Press Record to start recording 🎙️</h1>

      <button id="record" onClick={handleRecordClick}>
        {isRecording ? 'Stop' : 'Record'}
      </button>
      <button
        id="pause"
        onClick={handlePauseClick}
        style={{ display: isRecording ? 'inline-block' : 'none' }}
      >
        {isPaused ? 'Resume' : 'Pause'}
      </button>

      <select ref={micSelectRef} id="mic-select">
        <option value="" hidden>
          Select mic
        </option>
      </select>

      <label>
        <input
          type="checkbox"
          id="scrollingWaveform"
          checked={scrollingWaveform}
          onChange={(e) => setScrollingWaveform(e.target.checked)}
        />{' '}
        Scrolling waveform
      </label>

      <label>
        <input
          type="checkbox"
          id="continuousWaveform"
          checked={continuousWaveform}
          onChange={(e) => setContinuousWaveform(e.target.checked)}
        />{' '}
        Continuous waveform
      </label>

      <div>
        <h3>Frequency: {dominantFrequency ? dominantFrequency.toFixed(2) + ' Hz' : 'N/A'}</h3>
        {frequencyWarning && (
          <p style={{ color: 'red' }}>Warning: Frequency is too low (below 250 Hz)</p>
        )}
      </div>

      <div id="mic"></div>
      <div id="recordings"></div>

      <p ref={progressRef} id="recording-progress"></p>
    </div>
  );
};

export default AudioRecorder;
