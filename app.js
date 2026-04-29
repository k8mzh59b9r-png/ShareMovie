// 動画→MOV変換ツール - メインアプリケーション
// ffmpeg.wasm v0.12.x を使用した完全クライアントサイド変換

import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

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
  // state: 'idle' | 'file-selected' | 'loading' | 'converting' | 'done'
  selectCard.style.display = (state === 'converting' || state === 'done') ? 'none' : '';
  convertBtn.style.display = (state === 'converting' || state === 'done') ? 'none' : '';
  convertBtn.disabled = (state !== 'file-selected');
  progressSection.classList.toggle('is-visible', state === 'converting');
  resultSection.classList.toggle('is-visible', state === 'done');
  loadingOverlay.classList.toggle('is-visible', state === 'loading');
}

// --- FFmpegの初期化 ---
async function initFFmpeg() {
  if (ffmpeg) return;

  ffmpeg = new FFmpeg();

  // プログレスイベント
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

  setUIState('loading');
  loadingTextEl.textContent = '変換エンジンを読み込み中... (初回は約30秒)';

  try {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    console.log('FFmpeg loaded successfully');
  } catch (err) {
    console.error('FFmpeg load error:', err);
    setUIState('idle');
    showError('変換エンジンの読み込みに失敗しました。ページを再読み込みしてください。');
    ffmpeg = null;
    throw err;
  }

  setUIState(selectedFile ? 'file-selected' : 'idle');
}

// --- ファイル選択ハンドラ ---
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
    // FFmpeg初期化（未初期化の場合）
    await initFFmpeg();

    setUIState('converting');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressText.textContent = ' 処理中...';

    const ext = getFileExtension(selectedFile.name);
    const baseName = getFileBaseName(selectedFile.name);
    const inputName = 'input.' + ext;
    outputFileName = baseName + '.mov';

    // ファイルをffmpegの仮想FSに書き込み
    const fileData = await fetchFile(selectedFile);
    await ffmpeg.writeFile(inputName, fileData);

    // 変換コマンド実行
    // -c copy: コーデックをそのままコピー（コンテナ変換のみ、高速）
    // -movflags +faststart: Web再生最適化
    await ffmpeg.exec([
      '-i', inputName,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y',
      'output.mov'
    ]);

    // 出力ファイルの読み込み
    const data = await ffmpeg.readFile('output.mov');
    const blob = new Blob([data.buffer], { type: 'video/quicktime' });

    // 古いBlobURLを解放
    if (outputBlobUrl) {
      URL.revokeObjectURL(outputBlobUrl);
    }
    outputBlobUrl = URL.createObjectURL(blob);

    // 仮想FSのクリーンアップ
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.mov');
    } catch (_) { /* ignore cleanup errors */ }

    // 結果表示
    resultDetail.textContent =
      `${selectedFile.name} → ${outputFileName} (${formatFileSize(blob.size)})`;
    setUIState('done');

  } catch (err) {
    console.error('Conversion error:', err);
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
