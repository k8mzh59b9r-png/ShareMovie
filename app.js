// 動画→MOV変換ツール - メインアプリケーション
// ffmpeg.wasm v0.12.15 - ローカルESMモジュール使用

import { FFmpeg } from './lib/ffmpeg/index.js';

// --- DOM要素 ---
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileMeta = document.getElementById('fileMeta');
const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const progressText = document.getElementById('progressText');
const resultSection = document.getElementById('resultSection');
const resultDetail = document.getElementById('resultDetail');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingTextEl = document.getElementById('loadingText');
const selectCard = document.getElementById('selectCard');

// --- 状態管理 ---
let ffmpeg = null;
let selectedFile = null;
let outputBlobUrl = null;
let outputFileName = '';

// --- ユーティリティ ---
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileExtension(name) {
  return name.split('.').pop().toLowerCase();
}

function getFileBaseName(name) {
  const parts = name.split('.');
  parts.pop();
  return parts.join('.');
}

function showError(msg) {
  errorText.textContent = msg;
  errorMessage.classList.add('is-visible');
}

function hideError() {
  errorMessage.classList.remove('is-visible');
}

function setUIState(state) {
  selectCard.style.display = (state === 'converting' || state === 'done') ? 'none' : '';
  convertBtn.style.display = (state === 'converting' || state === 'done') ? 'none' : '';
  convertBtn.disabled = (state !== 'file-selected');
  progressSection.classList.toggle('is-visible', state === 'converting');
  resultSection.classList.toggle('is-visible', state === 'done');
  loadingOverlay.classList.toggle('is-visible', state === 'loading');
}

// タイムアウト付きfetch → BlobURL変換
async function toBlobURL(url, mimeType) {
  console.log(`[loader] Fetching: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
    const buf = await resp.arrayBuffer();
    console.log(`[loader] Downloaded: ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`);
    const blob = new Blob([buf], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('ダウンロードがタイムアウトしました');
    throw err;
  }
}

// --- FFmpegの初期化 ---
async function initFFmpeg() {
  if (ffmpeg) return;

  setUIState('loading');
  loadingTextEl.textContent = '変換エンジンを準備中...';

  try {
    ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress, time }) => {
      const pct = Math.min(Math.round(progress * 100), 100);
      progressBar.style.width = pct + '%';
      progressPercent.textContent = pct + '%';
      if (time > 0) {
        const sec = Math.round(time / 1000000);
        progressText.textContent = ` (${sec}秒処理済み)`;
      }
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[ffmpeg]', message);
    });

    // コアファイルはCDNからBlobURLとして読み込み（WASMが大きいためローカルに置かない）
    const coreBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm';

    loadingTextEl.textContent = 'コアエンジンをダウンロード中...';
    const coreURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, 'text/javascript');

    loadingTextEl.textContent = 'WASMをダウンロード中... (約30MB)';
    const wasmURL = await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, 'application/wasm');

    loadingTextEl.textContent = 'エンジンを初期化中...';
    console.log('[init] Loading FFmpeg core...');
    await ffmpeg.load({ coreURL, wasmURL });

    console.log('[init] FFmpeg loaded successfully!');
  } catch (err) {
    console.error('[init] FFmpeg load error:', err);
    setUIState('idle');
    showError('変換エンジンの読み込みに失敗しました: ' + err.message);
    ffmpeg = null;
    throw err;
  }

  setUIState(selectedFile ? 'file-selected' : 'idle');
}

// --- ファイル選択ハンドラ ---
dropzone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  hideError();

  const ext = getFileExtension(file.name);
  if (!['mp4', 'mov'].includes(ext)) {
    showError('MP4またはMOVファイルを選択してください。');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileMeta.textContent = `${formatFileSize(file.size)} • ${ext.toUpperCase()}`;
  fileInfo.classList.add('is-visible');
  dropzone.classList.add('is-active');
  setUIState('file-selected');
});

// --- 変換処理 ---
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  hideError();

  try {
    await initFFmpeg();

    setUIState('converting');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressText.textContent = ' 処理中...';

    const ext = getFileExtension(selectedFile.name);
    const baseName = getFileBaseName(selectedFile.name);
    const inputName = 'input.' + ext;
    outputFileName = baseName + '.mov';

    console.log('[convert] Reading input file...');
    const fileData = new Uint8Array(await selectedFile.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileData);

    // まずコーデックコピー（高速）を試す
    console.log('[convert] Trying codec copy...');
    let retCode = await ffmpeg.exec([
      '-i', inputName,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y',
      'output.mov'
    ]);
    console.log('[convert] Copy result code:', retCode);

    // 出力ファイルを確認
    let data;
    try {
      data = await ffmpeg.readFile('output.mov');
    } catch (e) {
      data = null;
    }

    // コピーが失敗 or 0バイトなら再エンコードで再試行
    if (!data || data.length === 0 || retCode !== 0) {
      console.log('[convert] Copy failed or empty, re-encoding...');
      progressText.textContent = ' 再エンコード中（少し時間がかかります）...';
      progressBar.style.width = '0%';

      retCode = await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        'output.mov'
      ]);
      console.log('[convert] Re-encode result code:', retCode);

      try {
        data = await ffmpeg.readFile('output.mov');
      } catch (e) {
        throw new Error('出力ファイルの読み込みに失敗しました');
      }
    }

    console.log('[convert] Output size:', data ? data.length : 0, 'bytes');

    if (!data || data.length === 0) {
      throw new Error('変換後のファイルが空です。入力ファイルが破損している可能性があります。');
    }

    const blob = new Blob([data], { type: 'video/quicktime' });

    if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
    outputBlobUrl = URL.createObjectURL(blob);

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.mov');
    } catch (_) {}

    resultDetail.textContent =
      `${selectedFile.name} → ${outputFileName} (${formatFileSize(blob.size)})`;
    setUIState('done');

  } catch (err) {
    console.error('[convert] Error:', err);
    setUIState('file-selected');
    showError('変換に失敗しました: ' + (err.message || '不明なエラー'));
  }
});

// --- ダウンロード ---
downloadBtn.addEventListener('click', () => {
  if (!outputBlobUrl) return;
  const a = document.createElement('a');
  a.href = outputBlobUrl;
  a.download = outputFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// --- リセット ---
resetBtn.addEventListener('click', () => {
  if (outputBlobUrl) {
    URL.revokeObjectURL(outputBlobUrl);
    outputBlobUrl = null;
  }
  selectedFile = null;
  outputFileName = '';
  fileInput.value = '';
  fileInfo.classList.remove('is-visible');
  dropzone.classList.remove('is-active');
  hideError();
  setUIState('idle');
});

// --- 初期状態 ---
setUIState('idle');
console.log('[app] Video converter ready');
