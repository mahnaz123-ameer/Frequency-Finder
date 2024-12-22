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

  useEffect(() => {
    const createWaveSurfer = () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
        //// Create a new Wavesurfer instance
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
        button.onclick = () => recordedWaveSurfer.playPause();
        recordedWaveSurfer.on('pause', () => (button.textContent = 'Play'));
        recordedWaveSurfer.on('play', () => (button.textContent = 'Pause'));

        // Download link
        const link = container.appendChild(document.createElement('a'));
        Object.assign(link, {
          href: recordedUrl,
          download: 'recording.' + blob.type.split(';')[0].split('/')[1] || 'webm',
          textContent: 'Download recording',
        });
      });

      wavesurferRef.current = wavesurfer;

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

      // Set warning if frequency is less than 50 Hz
      if (dominantFrequencyValue < 250) {
        setFrequencyWarning(true);
      } else {
        setFrequencyWarning(false);
      }
    };

    getDominantFrequency();
    setInterval(getDominantFrequency, 100); // Update every 100ms
  };

  // Record Button
  const handleRecordClick = () => {
    if (isRecording || isPaused) {
      recordRef.current.stopRecording();
      setIsRecording(false);
      setIsPaused(false);
    } else {
      const deviceId = micSelectRef.current.value;
      recordRef.current.startRecording({ deviceId }).then(() => {
        setIsRecording(true);
      });
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

      <p ref={progressRef}>00:00</p>

      <div id="mic" style={{ border: '1px solid #ddd', borderRadius: '4px', marginTop: '1rem' }}></div>

      <div id="recordings" style={{ margin: '1rem 0' }}></div>

      {dominantFrequency && (
        <div>
          <h3>Dominant Frequency: {dominantFrequency.toFixed(2)} Hz</h3>
        </div>
      )}

      {frequencyWarning && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          <strong>Warning: Dominant frequency is below 250 Hz!</strong>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
