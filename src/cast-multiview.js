export function createCastMultiviewController({
  root,
  onStart,
  onError = (message) => alert(message),
}) {
  if (!root) throw new Error('Cast multiview root is required.');

  const viewNames = ['front', 'left', 'back', 'right'];
  const state = Object.fromEntries(viewNames.map((name) => [name, null]));

  root.innerHTML = `
    <div class="cast-panel" role="dialog" aria-modal="true" aria-labelledby="cast-title">
      <div class="cast-head">
        <div>
          <div class="cast-kicker">Character references</div>
          <h3 id="cast-title">Build cast member</h3>
        </div>
        <button type="button" class="btn small ghost" data-cast-close>Close</button>
      </div>
      <p class="cast-help">Front is required. Add left, back and right views for a more accurate 3D character. Two or more views use multiview reconstruction.</p>
      <div class="cast-view-grid">
        ${viewNames.map((name) => `
          <div class="cast-view" data-view="${name}">
            <div class="cast-view-label">${name[0].toUpperCase() + name.slice(1)}${name === 'front' ? ' *' : ''}</div>
            <button type="button" class="cast-preview" data-pick="${name}" aria-label="Choose ${name} image">
              <span>+ ${name}</span>
            </button>
            <div class="cast-view-actions">
              <button type="button" class="btn small" data-pick="${name}">Choose</button>
              <button type="button" class="btn small ghost" data-remove="${name}" hidden>Remove</button>
            </div>
            <input type="file" accept="image/*" data-input="${name}" hidden />
          </div>
        `).join('')}
      </div>
      <div class="cast-guidance">
        Keep the same clothing and appearance in every view. Full body should be visible, feet included, with arms slightly away from the torso.
      </div>
      <button type="button" class="btn primary" data-cast-build disabled>Build character</button>
      <div class="cast-status" data-cast-status></div>
    </div>`;

  const buildButton = root.querySelector('[data-cast-build]');
  const status = root.querySelector('[data-cast-status]');

  for (const name of viewNames) {
    const input = root.querySelector(`[data-input="${name}"]`);
    const preview = root.querySelector(`[data-view="${name}"] .cast-preview`);
    const remove = root.querySelector(`[data-remove="${name}"]`);

    root.querySelectorAll(`[data-pick="${name}"]`).forEach((button) => {
      button.addEventListener('click', () => input.click());
    });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const image = await resizeToBase64(file, 1280, 0.88);
        state[name] = { base64: image, filename: file.name };
        preview.style.backgroundImage = `url(data:image/jpeg;base64,${image})`;
        preview.classList.add('has-image');
        preview.querySelector('span').textContent = name;
        remove.hidden = false;
        updateBuildState();
      } catch {
        onError(`Couldn't read the ${name} image.`);
      }
    });

    remove.addEventListener('click', () => {
      state[name] = null;
      input.value = '';
      preview.style.backgroundImage = '';
      preview.classList.remove('has-image');
      preview.querySelector('span').textContent = `+ ${name}`;
      remove.hidden = true;
      updateBuildState();
    });
  }

  root.querySelector('[data-cast-close]').addEventListener('click', () => {
    root.hidden = true;
  });

  buildButton.addEventListener('click', async () => {
    if (!state.front) return;
    buildButton.disabled = true;
    status.textContent = 'Uploading character views…';
    try {
      const views = Object.fromEntries(viewNames.map((name) => [name, state[name]?.base64 || null]));
      const response = await fetch('/api/cast-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Character start failed (${response.status}).`);
      status.textContent = data.mode === 'multiview' ? 'Multiview body started…' : 'Body started…';
      const filename = state.front.filename || 'Cast';
      const name = filename.replace(/\.[^.]+$/, '') || 'Cast';
      await onStart?.({ ...data, views, name });
    } catch (error) {
      status.textContent = '';
      onError(error?.message || 'Character generation failed.');
      buildButton.disabled = false;
    }
  });

  function updateBuildState() {
    const count = viewNames.filter((name) => state[name]).length;
    buildButton.disabled = !state.front;
    status.textContent = state.front
      ? count >= 2
        ? `${count} views ready · multiview mode`
        : 'Front ready · single-view fallback'
      : 'Add a front image to continue.';
  }

  updateBuildState();

  return {
    open() { root.hidden = false; },
    close() { root.hidden = true; },
    getState() { return structuredClone(state); },
  };
}

function resizeToBase64(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
      } catch (error) { reject(error); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}
