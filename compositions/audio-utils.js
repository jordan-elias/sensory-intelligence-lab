/**
 * Audio Utilities for Sensory Intelligence Lab Compositions
 * Shared functions for Web Audio API operations, buffer manipulation, and export
 */

(function(global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // AUDIO CONTEXT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  let audioContext = null;

  /**
   * Get or create the global AudioContext
   */
  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  /**
   * Resume AudioContext if suspended (required after user interaction)
   */
  function resumeAudioContext() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  /**
   * Get current time in AudioContext
   */
  function now() {
    return getAudioContext().currentTime;
  }

  // ─────────────────────────────────────────────────────────────
  // BUFFER MANIPULATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Normalize an audio buffer to a target peak level
   * @param {AudioBuffer} buffer - Buffer to normalize
   * @param {number} target - Target peak level (0-1), default 0.78
   */
  function normalizeBuffer(buffer, target = 0.78) {
    const channelData = buffer.getChannelData(0);
    let peak = 0;

    // Find peak level
    for (let i = 0; i < channelData.length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > peak) peak = absValue;
    }

    // Avoid division by zero
    if (peak < 0.001) return;

    // Scale to target
    const scale = target / peak;
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= scale;
    }
  }

  /**
   * Create a copy of an audio buffer
   * @param {AudioBuffer} buffer - Source buffer
   * @param {AudioContext} ctx - Audio context
   * @returns {AudioBuffer} - New buffer copy
   */
  function copyBuffer(buffer, ctx = null) {
    ctx = ctx || getAudioContext();
    const newBuffer = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      newBuffer.getChannelData(ch).set(buffer.getChannelData(ch));
    }
    return newBuffer;
  }

  /**
   * Concatenate multiple audio buffers
   * @param {AudioBuffer[]} buffers - Array of buffers to concatenate
   * @param {AudioContext} ctx - Audio context
   * @returns {AudioBuffer} - Concatenated buffer
   */
  function concatenateBuffers(buffers, ctx = null) {
    ctx = ctx || getAudioContext();
    if (buffers.length === 0) return null;

    const sr = buffers[0].sampleRate;
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const nc = buffers[0].numberOfChannels;

    const result = ctx.createBuffer(nc, totalLength, sr);
    let offset = 0;

    for (const buffer of buffers) {
      for (let ch = 0; ch < nc; ch++) {
        result.getChannelData(ch).set(buffer.getChannelData(ch), offset);
      }
      offset += buffer.length;
    }

    return result;
  }

  /**
   * Trim silence from start and end of buffer
   * @param {AudioBuffer} buffer - Buffer to trim
   * @param {number} threshold - Silence threshold (0-1), default 0.01
   * @returns {AudioBuffer} - Trimmed buffer
   */
  function trimSilence(buffer, threshold = 0.01) {
    const ctx = getAudioContext();
    const data = buffer.getChannelData(0);
    let start = 0, end = data.length;

    // Find start
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        start = i;
        break;
      }
    }

    // Find end
    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        end = i + 1;
        break;
      }
    }

    const trimmed = ctx.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      trimmed.getChannelData(ch).set(data.slice(start, end));
    }
    return trimmed;
  }

  /**
   * Resample an audio buffer to a new sample rate
   * @param {AudioBuffer} buffer - Source buffer
   * @param {number} newSampleRate - Target sample rate
   * @param {AudioContext} ctx - Audio context
   * @returns {Promise<AudioBuffer>} - Resampled buffer
   */
  function resampleBuffer(buffer, newSampleRate, ctx = null) {
    ctx = ctx || getAudioContext();
    if (newSampleRate === buffer.sampleRate) return Promise.resolve(buffer);

    const ratio = newSampleRate / buffer.sampleRate;
    const newLength = Math.round(buffer.length * ratio);
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      newLength,
      newSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
  }

  // ─────────────────────────────────────────────────────────────
  // WAVEFORM ANALYSIS & VISUALIZATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Get min/max levels for waveform visualization
   * @param {AudioBuffer} buffer - Buffer to analyze
   * @param {number} samples - Number of sample points
   * @returns {Array<{min, max}>} - Min/max for each sample point
   */
  function getWaveformData(buffer, samples = 1000) {
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / samples);
    const result = [];

    for (let i = 0; i < samples; i++) {
      let min = 0, max = 0;
      for (let j = 0; j < step && i * step + j < data.length; j++) {
        const value = data[i * step + j];
        if (value > max) max = value;
        if (value < min) min = value;
      }
      result.push({ min, max });
    }

    return result;
  }

  /**
   * Draw waveform to canvas
   * @param {AudioBuffer} buffer - Buffer to draw
   * @param {HTMLCanvasElement} canvas - Target canvas
   * @param {string} color - Waveform color, default var(--accent)
   */
  function drawWaveform(buffer, canvas, color = '#2a5c45') {
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    const height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const waveform = getWaveformData(buffer, width);
    ctx.fillStyle = color + '28';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let i = 0; i < waveform.length; i++) {
      const min = waveform[i].min;
      const max = waveform[i].max;
      const y1 = ((1 - max) * height) / 2;
      const y2 = ((1 - min) * height) / 2;
      ctx.fillRect(i, y1, 1, y2 - y1);
    }

    ctx.stroke();
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIO FILE EXPORT
  // ─────────────────────────────────────────────────────────────

  /**
   * Convert AudioBuffer to WAV format
   * @param {AudioBuffer} buffer - Buffer to convert
   * @returns {ArrayBuffer} - WAV file data
   */
  function audioBufferToWav(buffer) {
    const nc = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bps = 2; // 16-bit
    const dataLength = len * nc * bps;

    const wav = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wav);

    // Helper to write string to bytes
    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // Clamp value to -1..1
    function clamp(x) {
      return Math.max(-1, Math.min(1, x));
    }

    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, nc, true); // channels
    view.setUint32(24, sr, true); // sample rate
    view.setUint32(28, sr * nc * bps, true); // byte rate
    view.setUint16(32, nc * bps, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Audio data
    let offset = 44;
    const channels = [];
    for (let ch = 0; ch < nc; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < nc; ch++) {
        const value = clamp(channels[ch][i]);
        view.setInt16(offset, Math.round(value * 32767), true);
        offset += 2;
      }
    }

    return wav;
  }

  /**
   * Convert AudioBuffer to MP3 format (requires external library)
   * Placeholder for future integration
   * @param {AudioBuffer} buffer - Buffer to convert
   * @returns {Promise<ArrayBuffer>} - MP3 file data
   */
  function audioBufferToMp3(buffer) {
    console.warn('MP3 export requires external library. Using WAV instead.');
    return Promise.resolve(audioBufferToWav(buffer));
  }

  /**
   * Trigger download of audio buffer
   * @param {AudioBuffer} buffer - Buffer to download
   * @param {string} filename - Output filename
   * @param {string} format - File format ('wav', 'mp3'), default 'wav'
   */
  function downloadAudioBuffer(buffer, filename, format = 'wav') {
    let data, mimeType;

    if (format === 'wav') {
      data = audioBufferToWav(buffer);
      mimeType = 'audio/wav';
    } else if (format === 'mp3') {
      audioBufferToMp3(buffer).then((mp3Data) => {
        triggerBlobDownload(mp3Data, filename, 'audio/mpeg');
      });
      return;
    } else {
      console.error('Unsupported format:', format);
      return;
    }

    triggerBlobDownload(data, filename, mimeType);
  }

  /**
   * Trigger download of blob
   * @param {ArrayBuffer|Blob} data - Data to download
   * @param {string} filename - Output filename
   * @param {string} mimeType - MIME type
   */
  function triggerBlobDownload(data, filename, mimeType) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────
  // NOISE GENERATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Generate pink noise buffer using Poul Kelley algorithm
   * @param {AudioContext} ctx - Audio context
   * @param {number} duration - Duration in seconds
   * @returns {AudioBuffer} - Pink noise buffer
   */
  function generatePinkNoise(ctx = null, duration = 4) {
    ctx = ctx || getAudioContext();
    const sr = ctx.sampleRate;
    const len = sr * duration;
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    return buffer;
  }

  /**
   * Generate white noise buffer
   * @param {AudioContext} ctx - Audio context
   * @param {number} duration - Duration in seconds
   * @returns {AudioBuffer} - White noise buffer
   */
  function generateWhiteNoise(ctx = null, duration = 4) {
    ctx = ctx || getAudioContext();
    const sr = ctx.sampleRate;
    const len = sr * duration;
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  // ─────────────────────────────────────────────────────────────
  // UTILITY HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Convert MIDI note number to frequency
   * @param {number} midi - MIDI note (0-127)
   * @returns {number} - Frequency in Hz
   */
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Convert frequency to MIDI note number
   * @param {number} freq - Frequency in Hz
   * @returns {number} - MIDI note
   */
  function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
  }

  /**
   * Format duration in seconds to mm:ss.s
   * @param {number} seconds - Duration in seconds
   * @returns {string} - Formatted string
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }

  /**
   * Format byte size to human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Linear interpolation
   * @param {number} a - Start value
   * @param {number} b - End value
   * @param {number} t - Time (0-1)
   * @returns {number} - Interpolated value
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Clamp value between min and max
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Clamped value
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ─────────────────────────────────────────────────────────────
  // EXPORT API
  // ─────────────────────────────────────────────────────────────

  global.AudioUtils = {
    // Context management
    getAudioContext,
    resumeAudioContext,
    now,

    // Buffer manipulation
    normalizeBuffer,
    copyBuffer,
    concatenateBuffers,
    trimSilence,
    resampleBuffer,

    // Analysis & visualization
    getWaveformData,
    drawWaveform,

    // Export
    audioBufferToWav,
    audioBufferToMp3,
    downloadAudioBuffer,
    triggerBlobDownload,

    // Noise generation
    generatePinkNoise,
    generateWhiteNoise,

    // Utilities
    midiToFreq,
    freqToMidi,
    formatTime,
    formatBytes,
    lerp,
    clamp,
  };
})(typeof window !== 'undefined' ? window : global);
