import {
  initViewer,
  clearScene,
  displayGeometry,
  updateMeshColor,
  onResize,
  loader,
  objLoader,
  threeMFLoader
} from './viewer.js';

import {
  initEditor,
  parseParameters,
  getCode,
  setCode,
  getCurrentParameters,
  setStlMode as setEditorStlMode
} from './editor.js';

import {
  initModels,
  loadServerModels,
  setActiveServerFile
} from './models.js';

// DOM elements
const container = document.getElementById('viewport-container');
const editor = document.getElementById('editor');
const controlsContainer = document.getElementById('controls-container');
const modelsList = document.getElementById('models-list');
const downloadBtn = document.getElementById('downloadBtn');
const renderBtn = document.getElementById('renderBtn');
const saveServerBtn = document.getElementById('saveServerBtn');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const modelsCurrentPath = document.getElementById('modelsCurrentPath');
const fileTitle = document.getElementById('file-title');
const toggleCodeBtn = document.getElementById('toggleCodeBtn');
const toggleParamsBtn = document.getElementById('toggleParamsBtn');
const sidebarRight = document.getElementById('sidebar-right');
const sidebarRightResizer = document.getElementById('sidebar-right-resizer');
const editorGutter = document.getElementById('editor-gutter');
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarParams = document.getElementById('sidebar-params');
const sidebarLeftResizer = document.getElementById('sidebar-left-resizer');
const modelsPanel = document.getElementById('models-panel');
const resizer = document.getElementById('models-resizer');

const modeSolidBtn = document.getElementById('modeSolidBtn');
const modeEdgesBtn = document.getElementById('modeEdgesBtn');
const modeMeshBtn = document.getElementById('modeMeshBtn');
const modeWireframeBtn = document.getElementById('modeWireframeBtn');
const toggleGridBtn = document.getElementById('toggleGridBtn');
const toggleMeasureBtn = document.getElementById('toggleMeasureBtn');
const measureReadout = document.getElementById('measure-readout');
const toggleOrthoBtn = document.getElementById('toggleOrthoBtn');
const toggleUpAxisBtn = document.getElementById('toggleUpAxisBtn');
const scaleBar = document.getElementById('scale-bar');
const scaleLabel = document.getElementById('scale-label');
const fileInput = document.getElementById('fileInput');

// State
let loadedFileName = 'model';
let isFullRenderAvailable = false;
let isBusy = false;
let isStlMode = false;
let latestStlBlob = null;
let latestBlobFormat = '3mf';
let statusTimeout = null;

// Status
export function setStatus(text, isError = false, persistent = false) {
  const el = document.getElementById('status');

  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  if (!text) {
    el.style.display = 'none';
    return;
  }

  // Preview status intentionally supports HTML.
  if (text.startsWith('PREVIEW ONLY')) {
    el.innerHTML = text;
  } else {
    el.textContent = text;
  }

  el.style.color = isError ? '#ff3b30' : '#ffffff';
  el.style.borderTopColor = isError ? '#ff3b30' : '#f09c2a';
  el.style.display = 'block';

  if (!isError && !persistent) {
    statusTimeout = setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }
}

// Editor / viewer mode
export function setStlMode(enabled, fileFormat = '3D') {
  isStlMode = enabled;
  renderBtn.disabled = enabled;
  saveServerBtn.disabled = enabled;

  setEditorStlMode(enabled, fileFormat);
}

// Rendering
export async function triggerRun(isPreview = false) {
  if (isBusy || isStlMode) return false;

  isBusy = true;

  setStatus(
    isPreview ? 'generating preview...' : 'rendering full model...',
    false,
    true
  );

  const code = getCode();

  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        params: getCurrentParameters(),
        preview: isPreview
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({
        error: 'Unknown server error'
      }));

      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    latestStlBlob = await res.blob();
    latestBlobFormat = '3mf';

    const buffer = await latestStlBlob.arrayBuffer();
    const group = threeMFLoader.parse(buffer);

    displayGeometry(group, isPreview);

    isFullRenderAvailable = !isPreview;

    if (isPreview) {
      setStatus(
        'PREVIEW ONLY<br><span style="font-size:11px; opacity:0.85; font-style:italic;">click `full render` for final quality</span>',
        false,
        true
      );
    } else {
      setStatus('render completed.');
    }

    return true;

  } catch (err) {
    setStatus(`Error: ${err.message}`, true, true);
    return false;

  } finally {
    isBusy = false;
  }
}

// Download the latest rendered or opened model.
async function promptSaveFile() {
  if (!latestStlBlob) return;

  const extension = latestBlobFormat || '3mf';
  const format = extension.toUpperCase();
  const defaultName = `${loadedFileName}.${extension}`;

  let fileName = prompt(
    `Filename for ${format} download:`,
    defaultName
  );

  if (!fileName) return;

  fileName = fileName.trim();

  if (!fileName) return;

  // Keep the actual file format consistent with the downloaded content.
  fileName = fileName.replace(/\.(stl|3mf)$/i, '');
  fileName += `.${extension}`;

  const url = URL.createObjectURL(latestStlBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  setStatus(`${format} successfully exported.`);
}

// Open server model
async function openServerModel(filename, displayFilename) {
  clearScene();

  setStatus(`opening ${displayFilename}...`, false, true);

  try {
    const res = await fetch(
      `/api/models/${encodeURIComponent(filename)}`
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));

      throw new Error(
        error.error || `Error retrieving file (${res.status})`
      );
    }

    loadedFileName = displayFilename.replace(/\.[^/.]+$/, '');

    setActiveServerFile(filename);
    fileTitle.textContent = displayFilename;

    document.querySelectorAll('.file-entry').forEach((el) => {
      const nameSpan = el.querySelector('.file-name-label');

      el.classList.toggle(
        'active',
        nameSpan && nameSpan.textContent === displayFilename
      );
    });

    const lowerName = displayFilename.toLowerCase();

    // STL
    if (lowerName.endsWith('.stl')) {
      setStlMode(true, 'STL');

      latestStlBlob = await res.blob();
      latestBlobFormat = 'stl';

      const buffer = await latestStlBlob.arrayBuffer();
      const geometry = loader.parse(buffer);

      displayGeometry(geometry, false, true);

      isFullRenderAvailable = true;

      setStatus(`${displayFilename} loaded.`);
      return;
    }

    // OBJ
    if (lowerName.endsWith('.obj')) {
      setStlMode(true, 'OBJ');

      latestStlBlob = null;
      latestBlobFormat = 'obj';

      const text = await res.text();
      const group = objLoader.parse(text);

      displayGeometry(group, false, true);

      isFullRenderAvailable = false;

      setStatus(`${displayFilename} loaded.`);
      return;
    }

    // 3MF
    if (lowerName.endsWith('.3mf')) {
      setStlMode(true, '3MF');

      latestStlBlob = await res.blob();
      latestBlobFormat = '3mf';

      const buffer = await latestStlBlob.arrayBuffer();
      const group = threeMFLoader.parse(buffer);

      displayGeometry(group, false, true);

      isFullRenderAvailable = false;

      setStatus(`${displayFilename} loaded.`);
      return;
    }

    // SCAD / CSG
    setStlMode(false);

    const data = await res.json();

    setCode(data.content);

    isFullRenderAvailable = false;

    parseParameters();

    await triggerRun(true);

  } catch (err) {
    console.error('Error opening model:', err);
    setStatus(`Error: ${err.message}`, true);
  }
}

// Toolbar actions
downloadBtn.addEventListener('click', async () => {
  if (isStlMode) {
    await promptSaveFile();
    return;
  }

  if (!isFullRenderAvailable) {
    setStatus(
      'No final render available. Rendering model first...',
      false,
      true
    );

    const success = await triggerRun(false);

    if (!success) return;
  }

  await promptSaveFile();
});

renderBtn.addEventListener('click', () => {
  triggerRun(false);
});

// Save SCAD to server
saveServerBtn.addEventListener('click', async () => {
  const defaultName = `${loadedFileName}.scad`;

  const targetName = prompt(
    'Filename to save into /models:',
    defaultName
  );

  if (!targetName) return;

  let filename = targetName.trim();

  if (!filename) return;

  if (!filename.toLowerCase().endsWith('.scad')) {
    filename += '.scad';
  }

  setStatus('Saving file to server...');

  try {
    const formData = new FormData();

    formData.append(
      'file',
      new Blob([getCode()], {
        type: 'text/plain'
      }),
      filename
    );

    formData.append('filename', filename);

    const res = await fetch('/api/models', {
      method: 'POST',
      body: formData
    });

    const raw = await res.text();

    let data;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `Invalid server response (HTTP ${res.status}): ${raw.substring(0, 200)}`
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    loadedFileName = data.filename.replace(/\.[^/.]+$/, '');

    setActiveServerFile(data.filename);

    fileTitle.textContent = data.filename;

    setStatus(`Saved as /models/${data.filename}`);

    await loadServerModels();

  } catch (err) {
    setStatus(`Save error: ${err.message}`, true);
  }
});

// Open local file
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];

  if (!file) return;

  clearScene();

  setStatus(`opening ${file.name}...`, false, true);

  setActiveServerFile(null);

  loadedFileName = file.name.replace(/\.[^/.]+$/, '');

  fileTitle.textContent = file.name;

  document.querySelectorAll('.file-entry').forEach((el) => {
    el.classList.remove('active');
  });

  const lowerName = file.name.toLowerCase();

  // STL
  if (lowerName.endsWith('.stl')) {
    setStlMode(true, 'STL');

    const reader = new FileReader();

    reader.onload = (evt) => {
      latestStlBlob = new Blob(
        [evt.target.result],
        { type: 'application/sla' }
      );
      latestBlobFormat = 'stl';

      const geometry = loader.parse(evt.target.result);

      displayGeometry(geometry, false, true);

      isFullRenderAvailable = true;

      setStatus(`${file.name} loaded.`);
    };

    reader.readAsArrayBuffer(file);

    return;
  }

  // OBJ
  if (lowerName.endsWith('.obj')) {
    setStlMode(true, 'OBJ');

    latestStlBlob = null;
    latestBlobFormat = 'obj';

    const reader = new FileReader();

    reader.onload = (evt) => {
      const group = objLoader.parse(evt.target.result);

      displayGeometry(group, false, true);

      isFullRenderAvailable = false;

      setStatus(`${file.name} loaded.`);
    };

    reader.readAsText(file);

    return;
  }

  // 3MF
  if (lowerName.endsWith('.3mf')) {
    setStlMode(true, '3MF');

    latestStlBlob = file;
    latestBlobFormat = '3mf';

    const reader = new FileReader();

    reader.onload = (evt) => {
      const group = threeMFLoader.parse(evt.target.result);

      displayGeometry(group, false, true);

      isFullRenderAvailable = false;

      setStatus(`${file.name} loaded.`);
    };

    reader.readAsArrayBuffer(file);

    return;
  }

  // SCAD / CSG
  setStlMode(false);

  const reader = new FileReader();

  reader.onload = (evt) => {
    setCode(evt.target.result);

    isFullRenderAvailable = false;

    parseParameters();

    triggerRun(true);
  };

  reader.readAsText(file);
});

// Initialize viewer
initViewer({
  container,
  modeSolidBtn,
  modeEdgesBtn,
  modeMeshBtn,
  modeWireframeBtn,
  toggleGridBtn,
  toggleMeasureBtn,
  measureReadout,
  toggleOrthoBtn,
  toggleUpAxisBtn,
  scaleBar,
  scaleLabel
});

// Initialize editor
initEditor(
  {
    editor,
    editorGutter,
    controlsContainer,
    toggleCodeBtn,
    sidebarRight,
    sidebarRightResizer
  },
  {
    onParamChange: () => {
      isFullRenderAvailable = false;
      triggerRun(true);
    },

    onColorChange: (hex) => {
      updateMeshColor(hex);
    },

    onResize,

    onCodeBlur: () => {
      isFullRenderAvailable = false;
    }
  }
);

// Toggle parameters sidebar
toggleParamsBtn.addEventListener('click', () => {
  const isCollapsed = sidebarLeft.classList.toggle('collapsed');

  if (isCollapsed) {
    sidebarLeft.style.removeProperty('width');
  }

  toggleParamsBtn.textContent = isCollapsed
    ? 'show parameters'
    : 'hide parameters';

  onResize();

  setTimeout(onResize, 160);
});

// Resize parameters sidebar
let isResizingLeft = false;

sidebarLeftResizer.addEventListener('mousedown', (e) => {
  e.preventDefault();

  isResizingLeft = true;

  sidebarLeftResizer.classList.add('resizing');
  sidebarLeft.classList.add('resizing');

  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
});

window.addEventListener('mousemove', (e) => {
  if (!isResizingLeft) return;

  const newWidth = Math.max(200, e.clientX);

  sidebarLeft.style.width = `${newWidth}px`;

  onResize();
});

window.addEventListener('mouseup', () => {
  if (!isResizingLeft) return;

  isResizingLeft = false;

  sidebarLeftResizer.classList.remove('resizing');
  sidebarLeft.classList.remove('resizing');

  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// Initialize models
initModels(
  {
    modelsPanel,
    modelsList,
    modelsCurrentPath,
    refreshModelsBtn,
    resizer,
    sidebarLeft
  },
  {
    setStatus,

    onOpenModel: openServerModel,

    onRenameModel: (oldFilename, newFilename) => {
      loadedFileName = newFilename.replace(/\.[^/.]+$/, '');

      fileTitle.textContent = newFilename;
    }
  }
);

// Dynamic toolbar alignment
function alignCodeToggleBar() {
  const codeToggleBar = document.getElementById('code-toggle-bar');

  if (!codeToggleBar || !saveServerBtn || !renderBtn || !downloadBtn) {
    return;
  }

  const saveRect = saveServerBtn.getBoundingClientRect();
  const renderRect = renderBtn.getBoundingClientRect();
  const downloadRect = downloadBtn.getBoundingClientRect();

  const gap = renderRect.left - saveRect.right;

  if (gap > 0) {
    codeToggleBar.style.left =
      `${Math.round(downloadRect.right + gap)}px`;
  }
}

// Custom tooltips
function initTooltips() {
  const tooltip = document.createElement('div');

  tooltip.id = 'custom-tooltip';

  document.body.appendChild(tooltip);

  let currentTarget = null;
  let showTimeout = null;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[title], [data-tooltip]');

    if (!el) return;

    if (el.hasAttribute('title')) {
      const text = el.getAttribute('title');

      if (text) {
        el.setAttribute('data-tooltip', text);
        el.removeAttribute('title');
      }
    }

    const text = el.getAttribute('data-tooltip');

    if (!text) return;

    currentTarget = el;

    tooltip.textContent = text;

    clearTimeout(showTimeout);

    showTimeout = setTimeout(() => {
      if (currentTarget !== el) return;

      tooltip.style.display = 'block';

      const rect = el.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      let left = rect.left + (rect.width - tipRect.width) / 2;
      let top = rect.bottom + 6;

      if (left < 6) left = 6;

      if (left + tipRect.width > window.innerWidth - 6) {
        left = window.innerWidth - tipRect.width - 6;
      }

      if (top + tipRect.height > window.innerHeight - 6) {
        top = rect.top - tipRect.height - 6;
      }

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;

      tooltip.classList.add('visible');
    }, 600);
  });

  document.addEventListener('mouseout', (e) => {
    if (!currentTarget) return;

    if (e.target.closest('[data-tooltip]') === currentTarget) {
      clearTimeout(showTimeout);

      currentTarget = null;

      tooltip.classList.remove('visible');
      tooltip.style.display = 'none';
    }
  });

  window.addEventListener('scroll', () => {
    if (!currentTarget) return;

    tooltip.classList.remove('visible');
    tooltip.style.display = 'none';

    currentTarget = null;
  }, true);
}

// Bootstrap
loadServerModels();
parseParameters();
triggerRun(true);

alignCodeToggleBar();
initTooltips();

window.addEventListener('resize', alignCodeToggleBar);

if (document.fonts?.ready) {
  document.fonts.ready.then(alignCodeToggleBar);
}
