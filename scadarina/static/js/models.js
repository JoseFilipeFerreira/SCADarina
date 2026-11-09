let modelsPanel = null;
let modelsList = null;
let modelsCurrentPath = null;
let refreshModelsBtn = null;
let resizer = null;
let sidebarLeft = null;

let activeServerFile = null;
let setStatus = null;
let onOpenModel = null;
let onRenameModel = null;

const STORAGE_KEY_MODELS_HEIGHT = 'scadarina_models_panel_height';

// Parse API responses consistently
async function parseResponse(res) {
  const raw = await res.text();

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Invalid server response (HTTP ${res.status}): ${raw.substring(0, 200)}`
    );
  }
}

// Initialize
export function initModels(elements, callbacks) {
  modelsPanel = elements.modelsPanel;
  modelsList = elements.modelsList;
  modelsCurrentPath = elements.modelsCurrentPath;
  refreshModelsBtn = elements.refreshModelsBtn;
  resizer = elements.resizer;
  sidebarLeft = elements.sidebarLeft;

  setStatus = callbacks.setStatus;
  onOpenModel = callbacks.onOpenModel;
  onRenameModel = callbacks.onRenameModel;

  // Restore panel height
  const savedHeight = localStorage.getItem(STORAGE_KEY_MODELS_HEIGHT);

  if (savedHeight && modelsPanel) {
    const parsed = parseInt(savedHeight, 10);

    if (
      !isNaN(parsed) &&
      parsed >= 60 &&
      parsed <= window.innerHeight - 200
    ) {
      modelsPanel.style.height = `${parsed}px`;
    }
  }

  // Resize panel
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();

    isResizing = true;

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const sidebarRect = sidebarLeft.getBoundingClientRect();
    const newHeight = sidebarRect.bottom - e.clientY;

    if (
      newHeight >= 60 &&
      newHeight <= window.innerHeight - 200
    ) {
      modelsPanel.style.height = `${newHeight}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isResizing) return;

    isResizing = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (modelsPanel) {
      localStorage.setItem(
        STORAGE_KEY_MODELS_HEIGHT,
        parseInt(modelsPanel.style.height, 10) || modelsPanel.offsetHeight
      );
    }
  });

  refreshModelsBtn.addEventListener('click', loadServerModels);
}

// Active file
export function getActiveServerFile() {
  return activeServerFile;
}

export function setActiveServerFile(filename) {
  activeServerFile = filename;
}

// Load model list
export async function loadServerModels() {
  try {
    const res = await fetch('/api/models');
    const data = await parseResponse(res);

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const files = Array.isArray(data.files) ? data.files : [];

    modelsList.replaceChildren();

    if (modelsCurrentPath) {
      modelsCurrentPath.textContent = '/models';
    }

    if (files.length === 0) {
      const emptyLi = document.createElement('li');

      const message = document.createElement('span');

      message.textContent = 'no models found';
      message.style.color = '#888888';
      message.style.fontSize = '11px';
      message.style.padding = '4px';

      emptyLi.appendChild(message);
      modelsList.appendChild(emptyLi);

      return;
    }

    files.forEach((filename) => {
      const li = document.createElement('li');

      li.className = 'file-entry';

      if (activeServerFile === filename) {
        li.classList.add('active');
      }

      // Filename
      const label = document.createElement('span');

      label.className = 'file-name-label';
      label.textContent = filename;
      label.title = `open ${filename} in viewer and editor`;

      label.addEventListener('click', () => {
        onOpenModel?.(filename, filename);
      });

      // Actions
      const actions = document.createElement('div');

      actions.className = 'file-actions';

      // Download
      const dlBtn = document.createElement('button');

      dlBtn.className = 'file-action-btn';
      dlBtn.title = `download ${filename} to your computer`;

      dlBtn.innerHTML =
        '<span class="btn-icon" style="-webkit-mask-image: url(/svg/download.svg); mask-image: url(/svg/download.svg);"></span>';

      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        window.location.href =
          `/api/models/${encodeURIComponent(filename)}/download`;
      });

      // Rename
      const renBtn = document.createElement('button');

      renBtn.className = 'file-action-btn';
      renBtn.title = `rename ${filename}`;

      renBtn.innerHTML =
        '<span class="btn-icon" style="-webkit-mask-image: url(/svg/rename.svg); mask-image: url(/svg/rename.svg);"></span>';

      renBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        renameServerItem(filename, filename);
      });

      // Delete
      const delBtn = document.createElement('button');

      delBtn.className = 'file-action-btn';
      delBtn.title = `delete ${filename} permanently`;

      delBtn.innerHTML =
        '<span class="btn-icon" style="-webkit-mask-image: url(/svg/delete.svg); mask-image: url(/svg/delete.svg);"></span>';

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        deleteServerItem(filename, filename);
      });

      actions.append(dlBtn, renBtn, delBtn);

      li.append(label, actions);

      modelsList.appendChild(li);
    });

  } catch (err) {
    console.error('Error loading models:', err);

    modelsList.replaceChildren();

    const errorLi = document.createElement('li');

    errorLi.textContent = `Error loading models: ${err.message}`;
    errorLi.style.color = '#ff3b30';
    errorLi.style.fontSize = '11px';

    modelsList.appendChild(errorLi);
  }
}

// Delete model
export async function deleteServerItem(filename, name) {
  if (!confirm(`Delete file "${name}" from server?`)) {
    return;
  }

  try {
    const res = await fetch(
      `/api/models/${encodeURIComponent(filename)}`,
      {
        method: 'DELETE'
      }
    );

    const data = await parseResponse(res);

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (activeServerFile === filename) {
      activeServerFile = null;
    }

    setStatus?.(`Deleted: ${name}`);

    await loadServerModels();

  } catch (err) {
    setStatus?.(`Delete error: ${err.message}`, true);
  }
}

// Rename model
export async function renameServerItem(filename, oldName) {
  const newName = prompt(
    `Rename "${oldName}" to:`,
    oldName
  );

  if (!newName || newName.trim() === oldName) {
    return;
  }

  const trimmedName = newName.trim();

  if (
    trimmedName === '.' ||
    trimmedName === '..' ||
    trimmedName.includes('/') ||
    trimmedName.includes('\\')
  ) {
    setStatus?.('Invalid filename.', true);
    return;
  }

  try {
    const res = await fetch(
      `/api/models/${encodeURIComponent(filename)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newName: trimmedName
        })
      }
    );

    const data = await parseResponse(res);

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (activeServerFile === filename) {
      activeServerFile = data.filename;
      onRenameModel?.(filename, data.filename);
    }

    setStatus?.(`Renamed to "${data.filename}"`);

    await loadServerModels();

  } catch (err) {
    setStatus?.(`Rename error: ${err.message}`, true);
  }
}
