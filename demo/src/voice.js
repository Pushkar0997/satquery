/* ---------------------------------------------------------------------------
 * voice.js — browser microphone capture for the local demo server
 *
 * The browser records raw microphone samples and encodes a WAV file itself.
 * That keeps the `/transcribe` request compatible with Faster-Whisper without
 * requiring FFmpeg on the demo machine. The Python server owns transcription;
 * this module only owns capture and the small UI state machine.
 * ------------------------------------------------------------------------- */

const TARGET_SAMPLE_RATE = 16000;

function mergeChunks(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resample(samples, inputRate, outputRate) {
  if (inputRate === outputRate) return samples;

  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.round(samples.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let source = start; source < Math.max(start + 1, end); source += 1) {
      sum += samples[source] || 0;
    }
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function supportsRecording() {
  return Boolean(
    window.isSecureContext
    && navigator.mediaDevices
    && navigator.mediaDevices.getUserMedia
    && (window.AudioContext || window.webkitAudioContext)
  );
}

async function startCapture() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const context = new AudioContextClass();
  await context.resume();

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentOutput = context.createGain();
  const inputSampleRate = context.sampleRate;
  silentOutput.gain.value = 0;
  const chunks = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);

  return {
    async stop() {
      source.disconnect();
      processor.disconnect();
      silentOutput.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      const samples = resample(mergeChunks(chunks), inputSampleRate, TARGET_SAMPLE_RATE);
      return encodeWav(samples, TARGET_SAMPLE_RATE);
    },
  };
}

async function transcribe(audio, language) {
  const params = new URLSearchParams();
  if (language) params.set('language', language);
  const response = await fetch(`/transcribe?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body: audio,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The local voice server returned an invalid response. Start demo/voice_server.py and try again.');
  }
  if (!response.ok) throw new Error(payload.error || 'Voice transcription failed. Please try again.');
  return String(payload.transcript || '').trim();
}

export function createVoiceRecorder({ button, language, status, onTranscript }) {
  let capture = null;
  let working = false;
  let serverAvailable = false;

  const setStatus = (message, state = '') => {
    status.hidden = !message;
    status.textContent = message;
    status.dataset.state = state;
  };
  const setButton = (state) => {
    button.dataset.state = state;
    button.setAttribute('aria-pressed', String(state === 'recording'));
    button.textContent = state === 'recording' ? 'Stop' : 'Voice';
  };

  if (!supportsRecording()) {
    button.disabled = true;
    setStatus('Voice input needs a current browser opened through localhost.', 'error');
    return { setBusy: () => {} };
  }

  // `npm run dev` still serves the original typed-only demo. Do not let a
  // missing optional voice server turn into a failure during a live demo.
  button.disabled = true;
  setStatus('Checking local voice service…', 'working');
  fetch('/health')
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      serverAvailable = Boolean(payload && payload.status === 'ok');
      button.disabled = !serverAvailable;
      if (serverAvailable) {
        setStatus('');
      } else {
        setStatus('Voice is unavailable; typed queries continue to work normally.', 'error');
      }
    })
    .catch(() => {
      button.disabled = true;
      setStatus('Voice is unavailable; typed queries continue to work normally.', 'error');
    });

  button.addEventListener('click', async () => {
    if (!serverAvailable || working) return;

    if (!capture) {
      working = true;
      button.disabled = true;
      setStatus('Requesting microphone access…', 'working');
      try {
        capture = await startCapture();
        setButton('recording');
        setStatus('Recording… click Stop when you finish speaking.', 'recording');
      } catch (error) {
        setStatus(
          error && error.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Allow it in your browser and try again.'
            : 'Microphone could not be started. Check the browser permission and try again.',
          'error',
        );
      } finally {
        working = false;
        button.disabled = false;
      }
      return;
    }

    const activeCapture = capture;
    capture = null;
    working = true;
    button.disabled = true;
    setButton('working');
    setStatus('Preparing your recording…', 'working');
    try {
      const audio = await activeCapture.stop();
      setStatus('Transcribing locally with Faster-Whisper…', 'working');
      const transcript = await transcribe(audio, language.value);
      if (!transcript) throw new Error('No speech was detected. Please record a short question again.');
      onTranscript(transcript);
      setStatus('Transcript added to the query box. Review it, then select Ask.', 'success');
    } catch (error) {
      setStatus(error && error.message ? error.message : 'Voice transcription failed. Please try again.', 'error');
    } finally {
      working = false;
      button.disabled = false;
      setButton('idle');
    }
  });

  return {
    setBusy(busy) {
      button.disabled = busy || working;
      language.disabled = busy || working;
    },
  };
}
