const toolsGrid = document.getElementById('toolsGrid');
const search = document.getElementById('toolSearch');
let activeCategory = 'all';
let activeTool = null;
let selectedFiles = [];
let processed = [];
let activeIndex = 0;
let rotation = 0;
let busy = false;
let pdfImages = [];
let pdfOutputUrl = null;

const toolNames = {
  compress: 'Compress Image', resize: 'Resize images', convert: 'Convert images',
  crop: 'Crop & rotate images', watermark: 'Add watermark', metadata: 'Remove metadata', pdf: 'Create PDF', passport: 'Make passport photo', signature: 'Optimize signature',
  background: 'Remove Background', ocr: 'Extract Text', dpi: 'Convert DPI', palette: 'Extract Palette', grid: 'Split Image', frame: 'Create Mockup Frame'
};

function prettySize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let toastTimer;
function showDownloadToast() {
  const toast = document.getElementById('successToast');
  toast.hidden = false;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 2600);
}

const legalDialog = document.getElementById('legalDialog');
document.querySelectorAll('[data-legal-modal]').forEach((button) => button.addEventListener('click', () => {
  const section = button.dataset.legalModal;
  document.getElementById('legalTitle').textContent = { privacy: 'Privacy Policy', terms: 'Terms of Service', install: 'Install MyPixelKit' }[section];
  legalDialog.querySelectorAll('[data-legal-content]').forEach((content) => {
    content.hidden = content.dataset.legalContent !== section;
  });
  legalDialog.showModal();
}));
legalDialog.querySelectorAll('.legal-close, [data-close-legal]').forEach((button) => button.addEventListener('click', () => legalDialog.close()));
legalDialog.addEventListener('click', (event) => {
  if (event.target === legalDialog) legalDialog.close();
});

let installPrompt = null;
const installButton = document.getElementById('installApp');
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    document.querySelector('[data-legal-modal="install"]').click();
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
});
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) installButton.hidden = true;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

function filterTools() {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.tool-item').forEach((item) => {
    const card = item.querySelector('.tool-card');
    const show = (!query || `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(query)) &&
      (activeCategory === 'all' || card.dataset.category === activeCategory);
    item.hidden = !show;
    if (show) visible += 1;
  });
  document.getElementById('emptyTools').hidden = visible > 0;
}
search.addEventListener('input', filterTools);
document.querySelectorAll('.category-pill').forEach((pill) => pill.addEventListener('click', () => {
  activeCategory = pill.dataset.category;
  document.querySelectorAll('.category-pill').forEach((item) => item.classList.toggle('active', item === pill));
  filterTools();
}));

document.getElementById('themeToggle').addEventListener('click', (event) => {
  const root = document.documentElement;
  const dark = root.dataset.theme !== 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  event.currentTarget.setAttribute('aria-pressed', String(dark));
  event.currentTarget.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  event.currentTarget.querySelector('span:first-child').textContent = dark ? '☀' : '☾';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171722' : '#f7f8fc';
});
let sessionProcessed = 0;
let sessionSaved = 0;
function updateSessionStats() {
  if (!document.getElementById('processedCount')) return;
  const selectedBytes = selectedFiles.reduce((sum, item) => sum + item.file.size, 0);
  document.getElementById('memoryUsage').textContent = prettySize(selectedBytes);
  document.getElementById('processedCount').textContent = sessionProcessed;
  document.getElementById('ringCount').textContent = sessionProcessed;
  document.getElementById('savedSize').textContent = prettySize(sessionSaved);
  const percent = selectedBytes ? Math.min(100, Math.round(sessionSaved / (selectedBytes + sessionSaved) * 100)) : 0;
  document.getElementById('savedPercent').textContent = `${percent}%`;
  document.getElementById('savedProgress').style.width = `${percent}%`;
}

function startQuickTask(files) {
  search.value = '';
  activeCategory = 'all';
  filterTools();
  const card = document.querySelector('.tool-card[data-tool="compress"]');
  if (activeTool !== 'compress') openTool('compress', card);
  const drawer = card.closest('.tool-item').querySelector('.tool-drawer');
  if (drawer && files?.length) addFiles(files, drawer);
  requestAnimationFrame(() => (drawer || card).scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

document.querySelectorAll('[data-nav-tool]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const card = document.querySelector(`.tool-card[data-tool="${link.dataset.navTool}"]`);
  if (card) {
    search.value = '';
    activeCategory = 'all';
    filterTools();
    if (activeTool !== link.dataset.navTool) openTool(link.dataset.navTool, card);
    requestAnimationFrame(() => {
      const drawer = card.closest('.tool-item').querySelector('.tool-drawer');
      (drawer || card).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  closeMobileNav();
}));
document.querySelectorAll('[data-nav="dashboard"], [data-nav="tools"]').forEach((link) => link.addEventListener('click', closeMobileNav));
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const sidebarScrim = document.getElementById('sidebarScrim');
function closeMobileNav() {
  sidebar.classList.remove('open');
  sidebarScrim.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  sidebarScrim.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
});
sidebarScrim.addEventListener('click', closeMobileNav);
document.getElementById('newTask').addEventListener('click', () => document.getElementById('quickFileInput').click());
document.getElementById('browseImages').addEventListener('click', () => document.getElementById('quickDropInput').click());
['quickFileInput', 'quickDropInput'].forEach((id) => document.getElementById(id).addEventListener('change', (event) => {
  if (event.target.files.length) startQuickTask(event.target.files);
  event.target.value = '';
}));
const quickLaunch = document.querySelector('.quick-launch');
['dragenter', 'dragover'].forEach((type) => quickLaunch.addEventListener(type, (event) => {
  event.preventDefault();
  quickLaunch.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach((type) => quickLaunch.addEventListener(type, (event) => {
  event.preventDefault();
  quickLaunch.classList.remove('drag-over');
}));
quickLaunch.addEventListener('drop', (event) => startQuickTask(event.dataTransfer.files));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
  }
  if (event.key === 'Escape') closeMobileNav();
});
updateSessionStats();

function settingsMarkup(tool) {
  if (tool === 'compress') return `
    <label class="drawer-control quality-control"><span>Quality</span><b data-quality-label>85%</b><input data-quality type="range" min="1" max="100" value="85"></label>
    <label class="drawer-control target-size-control">Maximum file size<div class="target-size-row"><input data-target type="number" min="5" value="50"><span>KB</span></div><small>Aim for under 50 KB</small><span class="size-chips" aria-label="Common maximum file sizes">${[20, 50, 100, 200].map((size) => `<button type="button" data-size-preset="${size}">${size} KB</button>`).join('')}</span></label>`;
  if (tool === 'signature') return `<p class="drawer-hint signature-hint">Enhances contrast and compresses the image toward a 20 KB maximum for official forms.</p><label class="drawer-control">Quality <b data-quality-label>85%</b><input data-quality type="range" min="1" max="100" value="85"></label><label class="drawer-control">Maximum file size<input data-target type="number" min="5" value="20"><small>KB · signature target is 20 KB</small></label>`;
  if (tool === 'resize') return `
    <div class="drawer-control dimension-control"><span>Dimensions (px)</span><div class="dimension-inputs"><input data-width type="number" min="1" value="1200" aria-label="Width in pixels"><span>×</span><input data-height type="number" min="1" value="1200" aria-label="Height in pixels"></div></div>
    <label class="drawer-control inline-toggle"><input data-lock type="checkbox" checked> Lock aspect ratio</label>
    <div class="drawer-control preset-control"><span>Quick presets</span><div class="preset-buttons"><button type="button" data-preset="youtube">YouTube</button><button type="button" data-preset="insta">Insta</button><button type="button" data-preset="passport">Passport</button></div></div>`;
  if (tool === 'convert') return `<label class="drawer-control">Target format<select data-format><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp" selected>WebP</option><option value="image/avif">AVIF</option></select></label>`;
  if (tool === 'crop') return `
    <div class="drawer-control"><span>Rotate</span><div class="preset-buttons"><button type="button" data-rotate="-90" aria-label="Rotate counterclockwise">↶ 90°</button><button type="button" data-rotate="90" aria-label="Rotate clockwise">↷ 90°</button></div></div>
    <div class="drawer-control"><span>Aspect ratio</span><div class="preset-buttons"><button type="button" data-ratio="1" class="selected">1:1</button><button type="button" data-ratio="1.7778">16:9</button></div></div>`;
  if (tool === 'watermark') return `
    <label class="drawer-control">Watermark text<input data-watermark type="text" maxlength="60" value="© PixelKit" placeholder="Your watermark"></label>
    <label class="drawer-control">Opacity <b data-opacity-label>70%</b><input data-opacity type="range" min="10" max="100" value="70"></label>
    <div class="drawer-control"><span>Position</span><div class="position-grid" role="group" aria-label="Watermark position">${['top-left','top-center','top-right','middle-left','center','middle-right','bottom-left','bottom-center','bottom-right'].map((position) => `<button type="button" data-position="${position}" aria-label="${position.replace('-', ' ')}" class="${position === 'bottom-right' ? 'selected' : ''}"></button>`).join('')}</div></div>`;
  if (tool === 'passport') return `
    <label class="drawer-control passport-background-control">Photo background<select data-passport-background><option value="#ffffff" selected>White</option><option value="#EBF4FF">Light Blue</option></select></label>
    <label class="drawer-control">Print size<input type="text" value="3.5 × 4.5 cm · 300 dpi (413 × 531 px)" readonly></label>
    <p class="drawer-hint">Center-crops to the standard ratio. Background color fills transparent areas; it does not remove an existing background.</p>`;
  if (tool === 'background') return `<label class="drawer-control">Background tolerance <b data-bg-tolerance-label>55%</b><input data-bg-tolerance type="range" min="20" max="120" value="55"></label><p class="drawer-hint">Local color-based cutout works best on plain, evenly colored backgrounds.</p>`;
  if (tool === 'ocr') return `<p class="drawer-hint">Uses built-in browser text recognition when available; support varies by browser.</p><label class="drawer-control">Extracted text<textarea data-ocr-text rows="6" placeholder="Recognized text will appear here..."></textarea></label><button class="secondary-button" type="button" data-copy-text>Copy to Clipboard</button>`;
  if (tool === 'dpi') return `<label class="drawer-control">Target resolution<select data-dpi><option value="72">72 DPI</option><option value="150">150 DPI</option><option value="300" selected>300 DPI</option></select></label><label class="drawer-control">Output format<select data-dpi-format><option value="image/png">PNG</option><option value="image/jpeg">JPG</option></select></label>`;
  if (tool === 'palette') return `<p class="drawer-hint">Click a swatch to copy its HEX value.</p><div class="palette-swatches" data-palette-swatches aria-live="polite"></div>`;
  if (tool === 'grid') return `<label class="drawer-control">Grid layout<select data-grid-layout><option value="3x1">3 × 1</option><option value="3x3" selected>3 × 3</option><option value="2x2">2 × 2</option></select></label><p class="drawer-hint">Image parts will be bundled in a ZIP archive.</p>`;
  if (tool === 'frame') return `<label class="drawer-control">Corner radius <b data-radius-label>12%</b><input data-radius type="range" min="0" max="30" value="12"></label><label class="drawer-control">Shadow intensity <b data-shadow-label>25%</b><input data-shadow type="range" min="0" max="80" value="25"></label><label class="drawer-control">Canvas background <input data-frame-color type="color" value="#e9eaf1"></label>`;
  return `<label class="drawer-control inline-toggle"><input data-strip type="checkbox" checked> Strip all EXIF and embedded metadata</label><p class="drawer-hint">Canvas export re-encodes the image and removes embedded metadata.</p>`;
}

function openTool(tool, card) {
  if (busy) return;
  if (activeTool === tool) {
    closeDrawer();
    return;
  }
  closeDrawer();
  activeTool = tool;
  selectedFiles = [];
  processed = [];
  activeIndex = 0;
  updateSessionStats();
  rotation = 0;
  const item = card.closest('.tool-item');
  card.classList.add('active');
  card.setAttribute('aria-expanded', 'true');
  card.querySelector('.card-arrow').textContent = '⌄';
  const drawer = document.createElement('div');
  drawer.className = 'tool-drawer';
  drawer.dataset.tool = tool;
  if (tool === 'pdf') {
    drawer.innerHTML = `
      <div class="drawer-content">
        <div class="compact-dropzone" role="button" tabindex="0" aria-label="Choose photos for your PDF">
          <input id="pdf-file-input" class="hidden" data-pdf-files type="file" accept="image/*" multiple>
          <span class="upload-icon" aria-hidden="true">↑</span><strong>Drop photos or browse</strong>
          <small>Select up to 100 images · files stay on your device</small>
        </div>
        <div class="pdf-toolbar"><strong data-pdf-count>0 / 100 images selected</strong><button type="button" data-pdf-clear disabled>Clear All</button></div>
        <div class="pdf-thumb-grid" data-pdf-grid aria-live="polite"></div>
        <div class="drawer-settings pdf-settings">
          <label class="drawer-control">Page size<select data-pdf-size><option value="a4" selected>A4</option><option value="letter">US Letter</option><option value="fit">Fit to Image</option></select></label>
          <label class="drawer-control">Orientation<select data-pdf-orientation><option value="auto" selected>Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label class="drawer-control">Margins<select data-pdf-margin><option value="none">None</option><option value="small" selected>Small</option><option value="big">Big</option></select></label>
          <label class="drawer-control">Compression quality<select data-pdf-quality><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label>
        </div>
        <div class="pdf-progress" data-pdf-progress hidden><progress max="100" value="0" data-pdf-bar></progress><p data-pdf-status></p></div>
        <div class="drawer-actions"><button class="process-button" type="button" data-pdf-create disabled>Create PDF <span>→</span></button><button class="secondary-button" type="button" data-pdf-download disabled hidden>Download Combined PDF ↓</button></div>
        <p class="drawer-error" role="alert" data-pdf-error hidden></p>
      </div>`;
  } else {
    drawer.innerHTML = `
      <div class="drawer-content">
        <div class="compact-dropzone" role="button" tabindex="0" aria-label="Choose images to process">
          <input id="tool-file-input" class="hidden" data-files type="file" accept="image/*" multiple>
          <span class="upload-icon" aria-hidden="true">↑</span><strong>Drop images or browse</strong>
          <small>Multiple images · paste an image with Ctrl+V / ⌘V</small>
        </div>
        <div class="drawer-files" data-file-list></div>
        <div class="drawer-settings" data-settings>${settingsMarkup(tool)}</div>
        <div class="drawer-preview" data-preview hidden>
          <div class="drawer-preview-head"><strong>Before &amp; after</strong><span data-size-comparison></span></div>
          <div class="drawer-compare" style="--compare:50%"><img data-before alt="Original image preview"><div class="drawer-after"><img data-after alt="Processed image preview"></div><input data-compare type="range" min="0" max="100" value="50" aria-label="Compare original and processed image"><span class="drawer-compare-line" aria-hidden="true"></span></div>
        </div>
        <div class="drawer-actions"><button class="process-button" type="button" data-process disabled>${toolNames[tool]} <span>→</span></button><p class="result-comparison" data-result-comparison hidden></p><button class="secondary-button" type="button" data-download disabled hidden>Download Processed Image ↓</button><button class="secondary-button" type="button" data-zip disabled hidden>Download All as ZIP ↓</button></div>
        <p class="drawer-error" role="alert" data-error hidden></p>
      </div>`;
  }
  drawer.dataset.ratio = '1';
  item.append(drawer);
  requestAnimationFrame(() => drawer.classList.add('open'));
  if (tool === 'pdf') wirePdfDrawer(drawer);
  else wireDrawer(drawer, tool);
}

function closeDrawer() {
  const open = document.querySelector('.tool-drawer.open');
  if (open) {
    open.classList.remove('open');
    setTimeout(() => open.remove(), 300);
  }
  selectedFiles.forEach((item) => URL.revokeObjectURL(item.url));
  processed.forEach((item) => item && URL.revokeObjectURL(item.url));
  pdfImages.forEach((item) => URL.revokeObjectURL(item.url));
  pdfImages = [];
  if (pdfOutputUrl) URL.revokeObjectURL(pdfOutputUrl);
  pdfOutputUrl = null;
  document.querySelectorAll('.tool-card').forEach((card) => {
    card.classList.remove('active');
    card.setAttribute('aria-expanded', 'false');
    card.querySelector('.card-arrow').textContent = '→';
  });
  activeTool = null;
  selectedFiles = [];
  processed = [];
  updateSessionStats();
}

document.querySelectorAll('.tool-card').forEach((card) => {
  card.setAttribute('aria-expanded', 'false');
  card.addEventListener('click', () => openTool(card.dataset.tool, card));
});

function wirePdfDrawer(drawer) {
  const input = drawer.querySelector('[data-pdf-files]');
  const drop = drawer.querySelector('.compact-dropzone');
  input.addEventListener('change', (event) => addPdfImages(event.target.files, drawer));
  drop.addEventListener('click', (event) => {
    if (event.target !== input) input.click();
  });
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  ['dragenter','dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('drag-over'); }));
  drop.addEventListener('drop', (event) => addPdfImages(event.dataTransfer.files, drawer));
  drawer.querySelector('[data-pdf-clear]').addEventListener('click', () => {
    pdfImages.forEach((item) => URL.revokeObjectURL(item.url));
    pdfImages = [];
    resetPdfOutput(drawer);
    renderPdfImages(drawer);
  });
  drawer.querySelector('[data-pdf-create]').addEventListener('click', () => createCombinedPdf(drawer));
  drawer.querySelector('[data-pdf-download]').addEventListener('click', () => {
    if (!pdfOutputUrl) return;
    const link = document.createElement('a');
    link.href = pdfOutputUrl;
    link.download = 'PixelKit_Document.pdf';
    link.click();
    showDownloadToast();
  });
}

function resetPdfOutput(drawer) {
  if (pdfOutputUrl) URL.revokeObjectURL(pdfOutputUrl);
  pdfOutputUrl = null;
  drawer.querySelector('[data-pdf-download]').disabled = true;
  drawer.querySelector('[data-pdf-download]').hidden = true;
  drawer.querySelector('[data-pdf-progress]').hidden = true;
}

async function addPdfImages(fileList, drawer) {
  const error = drawer.querySelector('[data-pdf-error]');
  const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  const room = 100 - pdfImages.length;
  if (!imageFiles.length) {
    error.textContent = 'Choose valid image files to add to your PDF.';
    error.hidden = false;
    drawer.querySelector('[data-pdf-files]').value = '';
    return;
  }
  if (imageFiles.length > room) {
    error.textContent = `You can add ${room} more image${room === 1 ? '' : 's'} (100 maximum).`;
    error.hidden = false;
  } else error.hidden = true;
  resetPdfOutput(drawer);
  for (const file of imageFiles.slice(0, Math.max(0, room))) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error(`Could not open ${file.name}.`));
        element.src = url;
      });
      pdfImages.push({ file, image, url });
    } catch (problem) {
      URL.revokeObjectURL(url);
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
  drawer.querySelector('[data-pdf-files]').value = '';
  renderPdfImages(drawer);
}

function renderPdfImages(drawer) {
  const grid = drawer.querySelector('[data-pdf-grid]');
  grid.replaceChildren();
  pdfImages.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'pdf-thumb';
    card.draggable = !busy;
    card.dataset.index = index;
    card.innerHTML = `<img alt="Preview of ${item.file.name.replace(/[<>"&]/g, '')}"><span class="pdf-page-badge">Page ${index + 1}</span><button class="pdf-thumb-delete" type="button" aria-label="Remove image ${index + 1}">×</button><div class="pdf-thumb-actions"><button type="button" data-move="left" ${index === 0 ? 'disabled' : ''}>Move Left</button><button type="button" data-move="right" ${index === pdfImages.length - 1 ? 'disabled' : ''}>Move Right</button></div>`;
    card.querySelector('img').src = item.url;
    card.addEventListener('dragstart', (event) => {
      card.classList.add('dragging');
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      const to = Number(card.dataset.index);
      if (!Number.isInteger(from) || from === to) return;
      const [moved] = pdfImages.splice(from, 1);
      pdfImages.splice(to, 0, moved);
      resetPdfOutput(drawer);
      renderPdfImages(drawer);
    });
    card.querySelector('.pdf-thumb-delete').addEventListener('click', () => {
      URL.revokeObjectURL(pdfImages[index].url);
      pdfImages.splice(index, 1);
      resetPdfOutput(drawer);
      renderPdfImages(drawer);
    });
    card.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
      const destination = index + (button.dataset.move === 'left' ? -1 : 1);
      if (destination < 0 || destination >= pdfImages.length) return;
      [pdfImages[index], pdfImages[destination]] = [pdfImages[destination], pdfImages[index]];
      resetPdfOutput(drawer);
      renderPdfImages(drawer);
    }));
    grid.append(card);
  });
  drawer.querySelector('[data-pdf-count]').textContent = `${pdfImages.length} / 100 images selected`;
  drawer.querySelector('[data-pdf-clear]').disabled = pdfImages.length === 0 || busy;
  drawer.querySelector('[data-pdf-create]').disabled = pdfImages.length === 0 || busy;
  drawer.querySelectorAll('.pdf-thumb-delete, .pdf-thumb-actions button').forEach((button) => { button.disabled = busy; });
}

function pdfAscii(text) { return new TextEncoder().encode(text); }

async function imageJpegBytes(image, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare an image for the PDF.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not compress an image for the PDF.')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

function buildPdf(pageData) {
  const objectCount = 2 + pageData.length * 3;
  const objects = new Array(objectCount + 1);
  const pageRefs = pageData.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects[1] = pdfAscii('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = pdfAscii(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pageData.length} >>`);
  pageData.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const content = pdfAscii(`q\n${page.drawWidth.toFixed(2)} 0 0 ${page.drawHeight.toFixed(2)} ${page.x.toFixed(2)} ${page.y.toFixed(2)} cm\n/Im0 Do\nQ`);
    objects[pageId] = pdfAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = { jpeg: page.jpeg, width: page.imageWidth, height: page.imageHeight };
    objects[contentId] = pdfAscii(`<< /Length ${content.length} >>\nstream\n${new TextDecoder().decode(content)}\nendstream`);
  });
  const chunks = [pdfAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.slice(1).forEach((object, index) => {
    offsets[index + 1] = offset;
    const objectId = index + 1;
    const start = pdfAscii(`${objectId} 0 obj\n`);
    chunks.push(start);
    offset += start.length;
    if (object.jpeg) {
      const head = pdfAscii(`<< /Type /XObject /Subtype /Image /Width ${object.width} /Height ${object.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${object.jpeg.length} >>\nstream\n`);
      const tail = pdfAscii('\nendstream\nendobj\n');
      chunks.push(head, object.jpeg, tail);
      offset += head.length + object.jpeg.length + tail.length;
    } else {
      const body = new Uint8Array([...object, ...pdfAscii('\nendobj\n')]);
      chunks.push(body);
      offset += body.length;
    }
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(pdfAscii(xref));
  return new Blob(chunks, { type: 'application/pdf' });
}

async function createCombinedPdf(drawer) {
  if (busy || !pdfImages.length) return;
  busy = true;
  const createButton = drawer.querySelector('[data-pdf-create]');
  const progress = drawer.querySelector('[data-pdf-progress]');
  const bar = drawer.querySelector('[data-pdf-bar]');
  const status = drawer.querySelector('[data-pdf-status]');
  const error = drawer.querySelector('[data-pdf-error]');
  const download = drawer.querySelector('[data-pdf-download]');
  const pages = [];
  const quality = { low: 0.48, medium: 0.72, high: 0.9 }[drawer.querySelector('[data-pdf-quality]').value];
  const margin = { none: 0, small: 24, big: 48 }[drawer.querySelector('[data-pdf-margin]').value];
  const pageSize = drawer.querySelector('[data-pdf-size]').value;
  const orientation = drawer.querySelector('[data-pdf-orientation]').value;
  error.hidden = true;
  download.disabled = true;
  download.hidden = true;
  createButton.disabled = true;
  createButton.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span>Processing…';
  drawer.querySelector('[data-pdf-clear]').disabled = true;
  drawer.querySelectorAll('.pdf-settings select').forEach((select) => { select.disabled = true; });
  drawer.querySelectorAll('.pdf-thumb-delete, .pdf-thumb-actions button').forEach((button) => { button.disabled = true; });
  progress.hidden = false;
  bar.max = pdfImages.length;
  bar.value = 0;
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
    for (let i = 0; i < pdfImages.length; i += 1) {
      status.textContent = `Processing Page ${i + 1}/${pdfImages.length}...`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const item = pdfImages[i];
      const imageWidth = item.image.naturalWidth;
      const imageHeight = item.image.naturalHeight;
      const jpeg = await imageJpegBytes(item.image, quality);
      let width, height;
      if (pageSize === 'a4') [width, height] = [595.28, 841.89];
      else if (pageSize === 'letter') [width, height] = [612, 792];
      else [width, height] = [Math.min(14400, imageWidth * 0.75 + margin * 2), Math.min(14400, imageHeight * 0.75 + margin * 2)];
      const landscape = orientation === 'landscape' || (orientation === 'auto' && imageWidth > imageHeight);
      if (pageSize !== 'fit' && ((landscape && width < height) || (!landscape && width > height))) [width, height] = [height, width];
      const maxWidth = Math.max(1, width - margin * 2);
      const maxHeight = Math.max(1, height - margin * 2);
      const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
      const drawWidth = imageWidth * scale;
      const drawHeight = imageHeight * scale;
      pages.push({ jpeg, imageWidth, imageHeight, width, height, drawWidth, drawHeight, x: (width - drawWidth) / 2, y: (height - drawHeight) / 2 });
      bar.value = i + 1;
    }
    status.textContent = 'Preparing your single PDF file...';
    const blob = buildPdf(pages);
    if (pdfOutputUrl) URL.revokeObjectURL(pdfOutputUrl);
    pdfOutputUrl = URL.createObjectURL(blob);
    download.disabled = false;
    download.hidden = false;
    status.textContent = `Done · ${pdfImages.length} pages · ${prettySize(blob.size)}`;
  } catch (problem) {
    error.textContent = problem.message || 'Could not create the PDF.';
    error.hidden = false;
    progress.hidden = true;
  } finally {
    busy = false;
    createButton.innerHTML = 'Create PDF <span>→</span>';
    drawer.querySelectorAll('.pdf-settings select').forEach((select) => { select.disabled = false; });
    renderPdfImages(drawer);
  }
}

function wireDrawer(drawer, tool) {
  const input = drawer.querySelector('[data-files]');
  const drop = drawer.querySelector('.compact-dropzone');
  const processButton = drawer.querySelector('[data-process]');
  const downloadButton = drawer.querySelector('[data-download]');
  const zipButton = drawer.querySelector('[data-zip]');
  if (tool === 'background') downloadButton.textContent = 'Download Transparent PNG ↓';
  if (tool === 'grid') zipButton.textContent = 'Download Parts ↓';
  if (tool === 'ocr') processButton.innerHTML = `${toolNames[tool]} <span>→</span>`;
  input.addEventListener('change', (event) => addFiles(event.target.files, drawer));
  drop.addEventListener('click', (event) => {
    if (event.target !== input) input.click();
  });
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  ['dragenter','dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('drag-over'); }));
  drop.addEventListener('drop', (event) => addFiles(event.dataTransfer.files, drawer));

  drawer.querySelector('[data-compare]').addEventListener('input', (event) => {
    drawer.querySelector('.drawer-compare').style.setProperty('--compare', `${event.target.value}%`);
  });
  drawer.querySelector('[data-quality]')?.addEventListener('input', (event) => { drawer.querySelector('[data-quality-label]').textContent = `${event.target.value}%`; });
  drawer.querySelectorAll('[data-size-preset]').forEach((button) => button.addEventListener('click', () => {
    drawer.querySelector('[data-target]').value = button.dataset.sizePreset;
    drawer.querySelectorAll('[data-size-preset]').forEach((preset) => preset.classList.toggle('selected', preset === button));
  }));
  drawer.querySelector('[data-opacity]')?.addEventListener('input', (event) => { drawer.querySelector('[data-opacity-label]').textContent = `${event.target.value}%`; });
  drawer.querySelector('[data-bg-tolerance]')?.addEventListener('input', (event) => { drawer.querySelector('[data-bg-tolerance-label]').textContent = event.target.value; });
  drawer.querySelector('[data-radius]')?.addEventListener('input', (event) => { drawer.querySelector('[data-radius-label]').textContent = `${event.target.value}%`; });
  drawer.querySelector('[data-shadow]')?.addEventListener('input', (event) => { drawer.querySelector('[data-shadow-label]').textContent = `${event.target.value}%`; });
  drawer.querySelector('[data-copy-text]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const text = drawer.querySelector('[data-ocr-text]').value;
    try { await navigator.clipboard.writeText(text); }
    catch { drawer.querySelector('[data-ocr-text]').select(); document.execCommand('copy'); }
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = 'Copy to Clipboard'; }, 1000);
  });
  const invalidatePassportOutput = () => {
    if (tool !== 'passport') return;
    processed.forEach((output) => output && URL.revokeObjectURL(output.url));
    processed = [];
    drawer.querySelector('[data-download]').hidden = true;
    drawer.querySelector('[data-download]').disabled = true;
    drawer.querySelector('[data-zip]').hidden = true;
    drawer.querySelector('[data-zip]').disabled = true;
    updatePreview(drawer);
  };
  drawer.querySelector('[data-passport-background]')?.addEventListener('change', (event) => {
    drawer.dataset.passportBackground = event.target.value;
    invalidatePassportOutput();
  });
  drawer.querySelector('[data-rotate]')?.parentElement.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rotate]');
    if (button) rotation = (rotation + Number(button.dataset.rotate) + 360) % 360;
  });
  drawer.querySelectorAll('[data-ratio]').forEach((button) => button.addEventListener('click', () => {
    drawer.querySelectorAll('[data-ratio]').forEach((item) => item.classList.toggle('selected', item === button));
    drawer.dataset.ratio = button.dataset.ratio;
  }));
  drawer.querySelectorAll('[data-position]').forEach((button) => button.addEventListener('click', () => {
    drawer.querySelectorAll('[data-position]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  drawer.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const dimensions = { youtube: [1280, 720], insta: [1080, 1080], passport: [600, 600] }[button.dataset.preset];
    drawer.querySelector('[data-width]').value = dimensions[0];
    drawer.querySelector('[data-height]').value = dimensions[1];
  }));
  const gridLayout = drawer.querySelector('[data-grid-layout]');
  if (gridLayout) {
    drawer.dataset.gridLayout = gridLayout.value;
    gridLayout.addEventListener('change', () => { drawer.dataset.gridLayout = gridLayout.value; });
  }
  [drawer.querySelector('[data-width]'), drawer.querySelector('[data-height]')].filter(Boolean).forEach((field) => field.addEventListener('input', () => {
    if (!drawer.querySelector('[data-lock]').checked || !selectedFiles[activeIndex]) return;
    const image = selectedFiles[activeIndex].image;
    if (field.matches('[data-width]')) {
      drawer.querySelector('[data-height]').value = Math.max(1, Math.round(Number(field.value) * image.naturalHeight / image.naturalWidth));
    } else {
      drawer.querySelector('[data-width]').value = Math.max(1, Math.round(Number(field.value) * image.naturalWidth / image.naturalHeight));
    }
  }));
  processButton.addEventListener('click', () => processFiles(drawer, tool));
  downloadButton.addEventListener('click', () => downloadActive());
  zipButton.addEventListener('click', () => downloadZip());
}

function addFiles(list, drawer) {
  const valid = Array.from(list || []).filter((file) => file.type.startsWith('image/') && file.size <= 150 * 1024 * 1024);
  const error = drawer.querySelector('[data-error]');
  if (!valid.length) {
    error.textContent = 'Choose an image up to 150 MB.';
    error.hidden = false;
    drawer.querySelector('[data-files]').value = '';
    return;
  }
  error.hidden = true;
  processed.forEach((item) => item && URL.revokeObjectURL(item.url));
  processed = [];
  drawer.querySelector('[data-download]').disabled = true;
  drawer.querySelector('[data-download]').hidden = true;
  drawer.querySelector('[data-zip]').disabled = true;
  drawer.querySelector('[data-zip]').hidden = true;
  let selectFirstLoaded = true;
  valid.forEach((file) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      selectedFiles.push({ file, url, image });
      if (selectFirstLoaded) {
        activeIndex = selectedFiles.length - 1;
        selectFirstLoaded = false;
      }
      renderFileList(drawer);
      updatePreview(drawer);
    };
    image.onerror = () => { URL.revokeObjectURL(url); error.textContent = `Could not open ${file.name}.`; error.hidden = false; };
    image.src = url;
  });
  drawer.querySelector('[data-files]').value = '';
}

function renderFileList(drawer) {
  const list = drawer.querySelector('[data-file-list]');
  list.replaceChildren();
  selectedFiles.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = `drawer-file-card${index === activeIndex ? ' selected' : ''}`;
    const preview = document.createElement('img');
    preview.src = item.url;
    preview.alt = '';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'drawer-file-info';
    details.setAttribute('aria-label', `Select ${item.file.name}, ${prettySize(item.file.size)}`);
    details.innerHTML = `<strong></strong><small>${prettySize(item.file.size)}</small>`;
    details.querySelector('strong').textContent = item.file.name;
    details.addEventListener('click', () => { activeIndex = index; renderFileList(drawer); updatePreview(drawer); });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'drawer-file-remove';
    remove.setAttribute('aria-label', `Remove ${item.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(item.url);
      if (processed[index]) URL.revokeObjectURL(processed[index].url);
      selectedFiles.splice(index, 1);
      processed.splice(index, 1);
      activeIndex = Math.min(activeIndex, selectedFiles.length - 1);
      renderFileList(drawer);
      updatePreview(drawer);
    });
    card.append(preview, details, remove);
    list.append(card);
  });
  drawer.querySelector('[data-process]').disabled = selectedFiles.length === 0 || busy;
  updateSessionStats();
}

function updatePreview(drawer) {
  const item = selectedFiles[activeIndex];
  const preview = drawer.querySelector('[data-preview]');
  const resultBadge = drawer.querySelector('[data-result-comparison]');
  if (!item) {
    preview.hidden = true;
    resultBadge.hidden = true;
    drawer.querySelector('[data-download]').disabled = true;
    drawer.querySelector('[data-download]').hidden = true;
    drawer.querySelector('[data-zip]').disabled = true;
    drawer.querySelector('[data-zip]').hidden = true;
    return;
  }
  preview.hidden = false;
  drawer.querySelector('[data-before]').src = item.url;
  const output = processed[activeIndex];
  drawer.querySelector('[data-after]').src = output?.url || item.url;
  drawer.querySelector('[data-size-comparison]').textContent = output
    ? `Before: ${prettySize(item.file.size)} ➜ After: ${prettySize(output.blob.size)}`
    : `Before: ${prettySize(item.file.size)} · process to compare`;
  if (output) {
    const reduction = Math.max(0, Math.round((1 - output.blob.size / item.file.size) * 100));
    resultBadge.textContent = activeTool === 'compress' || activeTool === 'signature'
      ? `Original: ${prettySize(item.file.size)} ➔ Compressed: ${prettySize(output.blob.size)} (-${reduction}%)`
      : `Original: ${prettySize(item.file.size)} · Processed: ${prettySize(output.blob.size)}`;
  }
  resultBadge.hidden = !output;
  drawer.querySelector('[data-download]').disabled = !output;
  drawer.querySelector('[data-download]').hidden = !output;
  drawer.querySelector('[data-zip]').disabled = !processed.some(Boolean);
  drawer.querySelector('[data-zip]').hidden = !processed.some(Boolean);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('Could not create this image. Try another output format.'));
    if (blob.type !== type) return reject(new Error(`${type === 'image/avif' ? 'AVIF export is not supported by this browser' : 'This output format is not supported'}. Try JPG, PNG, or WebP.`));
    resolve(blob);
  }, type, quality));
}

function getCanvas(image, drawer, tool, type, quality) {
  let canvas;
  if (tool === 'crop' || tool === 'passport') {
    const angle = tool === 'crop' ? rotation : 0;
    const sideways = angle % 180 !== 0;
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const rotatedWidth = sideways ? sourceHeight : sourceWidth;
    const rotatedHeight = sideways ? sourceWidth : sourceHeight;
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = rotatedWidth;
    rotatedCanvas.height = rotatedHeight;
    const rotatedContext = rotatedCanvas.getContext('2d');
    if (!rotatedContext) throw new Error('Your browser could not process this image.');
    rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
    rotatedContext.rotate(angle * Math.PI / 180);
    rotatedContext.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);
    const ratio = tool === 'passport' ? 7 / 9 : Number(drawer.dataset.ratio || 1);
    let sx = 0, sy = 0, sw = rotatedWidth, sh = rotatedHeight;
    if (rotatedWidth / rotatedHeight > ratio) { sw = rotatedHeight * ratio; sx = (rotatedWidth - sw) / 2; }
    else { sh = rotatedWidth / ratio; sy = (rotatedHeight - sh) / 2; }
    canvas = document.createElement('canvas');
    canvas.width = tool === 'passport' ? 413 : Math.max(1, Math.round(sw));
    canvas.height = tool === 'passport' ? 531 : Math.max(1, Math.round(sh));
    const cropContext = canvas.getContext('2d');
    if (!cropContext) throw new Error('Your browser could not process this image.');
    if (tool === 'passport') {
      cropContext.fillStyle = drawer.dataset.passportBackground || '#ffffff';
      cropContext.fillRect(0, 0, canvas.width, canvas.height);
    }
    cropContext.drawImage(rotatedCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  } else {
    canvas = document.createElement('canvas');
    const targetContext = canvas.getContext('2d');
    if (!targetContext) throw new Error('Your browser could not process this image.');
    if (tool === 'resize') {
      const targetWidth = Number(drawer.querySelector('[data-width]').value);
      const targetHeight = Number(drawer.querySelector('[data-height]').value);
      if (!targetWidth || !targetHeight || targetWidth < 1 || targetHeight < 1) throw new Error('Enter valid width and height values.');
      if (drawer.querySelector('[data-lock]').checked) {
        const scale = Math.min(1, targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      } else {
        canvas.width = Math.round(targetWidth);
        canvas.height = Math.round(targetHeight);
      }
    } else {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    }
    const context = canvas.getContext('2d');
    if (type === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  if (tool === 'watermark') {
    const context = canvas.getContext('2d');
    const text = drawer.querySelector('[data-watermark]').value.trim();
    if (text) {
      const position = drawer.querySelector('[data-position].selected')?.dataset.position || 'bottom-right';
      const size = Math.max(16, Math.round(canvas.width * 0.04));
      const margin = size * 0.65;
      const horizontal = position.endsWith('left') ? 'left' : position.endsWith('right') ? 'right' : 'center';
      const vertical = position.startsWith('top') ? 'top' : position.startsWith('bottom') ? 'bottom' : 'middle';
      context.font = `600 ${size}px sans-serif`;
      context.textAlign = horizontal;
      context.textBaseline = vertical === 'top' ? 'top' : vertical === 'middle' ? 'middle' : 'bottom';
      context.globalAlpha = Number(drawer.querySelector('[data-opacity]').value) / 100;
      context.fillStyle = '#fff';
      context.shadowColor = 'rgba(0,0,0,.65)'; context.shadowBlur = size * .16;
      context.fillText(text, horizontal === 'left' ? margin : horizontal === 'right' ? canvas.width - margin : canvas.width / 2,
        vertical === 'top' ? margin : vertical === 'bottom' ? canvas.height - margin : canvas.height / 2, canvas.width * .85);
      context.globalAlpha = 1;
    }
  }
  return canvas;
}

function cropSignature(canvas) {
  const context = canvas.getContext('2d');
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (data[offset + 3] > 20 && luminance < 235) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) return canvas;
  const padX = Math.round((right - left + 1) * 0.06);
  const padY = Math.round((bottom - top + 1) * 0.12);
  left = Math.max(0, left - padX); top = Math.max(0, top - padY);
  right = Math.min(width - 1, right + padX); bottom = Math.min(height - 1, bottom + padY);
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
}

function enhanceSignatureContrast(canvas) {
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const contrast = 1.45;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
    pixels[index] = enhanced;
    pixels[index + 1] = enhanced;
    pixels[index + 2] = enhanced;
  }
  context.putImageData(image, 0, 0);
}

function removePlainBackground(canvas, tolerance) {
  const context = canvas.getContext('2d');
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = frame;
  const sample = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [sample(0, 0), sample(width - 1, 0), sample(0, height - 1), sample(width - 1, height - 1)];
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
  const limit = Number(tolerance) * 2.2;
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - background[0], data[i + 1] - background[1], data[i + 2] - background[2]);
    if (distance < limit) data[i + 3] = Math.round(data[i + 3] * Math.min(1, Math.max(0, (distance - limit * 0.72) / (limit * 0.28))));
  }
  context.putImageData(frame, 0, 0);
}

function addRoundedFrame(source, drawer) {
  const padding = Math.max(8, Math.round(Math.min(source.width, source.height) * 0.06));
  const canvas = document.createElement('canvas');
  canvas.width = source.width + padding * 2;
  canvas.height = source.height + padding * 2;
  const context = canvas.getContext('2d');
  context.fillStyle = drawer.querySelector('[data-frame-color]').value;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const radius = Math.min(source.width, source.height) * Number(drawer.querySelector('[data-radius]').value) / 100;
  const shadow = Number(drawer.querySelector('[data-shadow]').value) / 100;
  context.save();
  context.shadowColor = `rgba(20, 20, 35, ${shadow * 0.65})`;
  context.shadowBlur = padding * shadow;
  context.shadowOffsetY = padding * shadow * 0.35;
  const x = padding, y = padding, width = source.width, height = source.height;
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
  context.fillStyle = '#fff';
  context.fill();
  context.shadowColor = 'transparent';
  context.clip();
  context.drawImage(source, padding, padding);
  context.restore();
  return canvas;
}

async function extractPalette(image, drawer) {
  const canvas = document.createElement('canvas');
  canvas.width = 80; canvas.height = 80;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 80, 80);
  const pixels = context.getImageData(0, 0, 80, 80).data;
  const counts = new Map();
  for (let i = 0; i < pixels.length; i += 16) {
    const color = [pixels[i], pixels[i + 1], pixels[i + 2]].map((value) => Math.round(value / 32) * 32);
    const key = color.map((value) => Math.min(255, value).toString(16).padStart(2, '0')).join('').toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const swatches = drawer.querySelector('[data-palette-swatches]');
  swatches.replaceChildren();
  const topColors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  while (topColors.length && topColors.length < 5) topColors.push(topColors[topColors.length - 1]);
  topColors.forEach(([hex]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'palette-chip'; button.style.setProperty('--swatch', `#${hex}`);
    button.textContent = `#${hex}`; button.setAttribute('aria-label', `Copy color #${hex}`);
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`#${hex}`); }
      catch { /* The HEX value remains visible for manual copying. */ }
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = `#${hex}`; }, 900);
    });
    swatches.append(button);
  });
}

async function extractText(image) {
  if (!('TextDetector' in window)) throw new Error('Built-in OCR is not available in this browser. Try a browser that supports the TextDetector API.');
  const detector = new TextDetector();
  const blocks = await detector.detect(image);
  return blocks.map((block) => block.rawValue || '').filter(Boolean).join('\n');
}

async function addDpiMetadata(blob, dpi, type) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (type === 'image/png') {
    const ppm = Math.round(Number(dpi) / 0.0254);
    const chunk = new Uint8Array(21);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
    view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
    view.setUint32(17, crc32(chunk.subarray(4, 17)));
    return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type });
  }
  const density = Math.min(65535, Number(dpi));
  const app0 = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, density >> 8, density & 255, density >> 8, density & 255, 0, 0]);
  return new Blob([bytes.subarray(0, 2), app0, bytes.subarray(2)], { type });
}

async function splitImage(item, drawer) {
  const [columns, rows] = drawer.querySelector('[data-grid-layout]').value.split('x').map(Number);
  const parts = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const left = Math.floor(column * item.image.naturalWidth / columns);
    const top = Math.floor(row * item.image.naturalHeight / rows);
    const right = Math.floor((column + 1) * item.image.naturalWidth / columns);
    const bottom = Math.floor((row + 1) * item.image.naturalHeight / rows);
    const canvas = document.createElement('canvas'); canvas.width = right - left; canvas.height = bottom - top;
    canvas.getContext('2d').drawImage(item.image, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, 'image/png');
    const name = `${item.file.name.replace(/\.[^/.]+$/, '') || 'image'}-part-${row + 1}-${column + 1}.png`;
    parts.push({ blob, name, url: URL.createObjectURL(blob) });
  }
  return parts;
}

async function renderImage(item, drawer, tool) {
  if (tool === 'metadata' && !drawer.querySelector('[data-strip]').checked) {
    const base = item.file.name.replace(/\.[^/.]+$/, '') || 'image';
    return { blob: item.file, url: URL.createObjectURL(item.file), name: item.file.name || `${base}-original` };
  }
  const type = tool === 'convert' ? drawer.querySelector('[data-format]').value : tool === 'background' ? 'image/png' : tool === 'dpi' ? drawer.querySelector('[data-dpi-format]').value : 'image/webp';
  let quality = Number(drawer.querySelector('[data-quality]')?.value || 85) / 100;
  const targetKB = Number(drawer.querySelector('[data-target]')?.value || (tool === 'signature' ? 20 : 50));
  if ((tool === 'compress' || tool === 'signature') && (!Number.isFinite(targetKB) || targetKB < 5)) throw new Error('Enter a maximum file size of at least 5 KB.');
  let canvas = getCanvas(item.image, drawer, tool, type, quality);
  if (tool === 'background') removePlainBackground(canvas, drawer.querySelector('[data-bg-tolerance]').value);
  if (tool === 'frame') canvas = addRoundedFrame(canvas, drawer);
  if (tool === 'signature') {
    canvas = cropSignature(canvas);
    enhanceSignatureContrast(canvas);
  }
  let blob = await canvasBlob(canvas, type, quality);
  if (tool === 'dpi') blob = await addDpiMetadata(blob, drawer.querySelector('[data-dpi]').value, type);
  if (tool === 'compress' || tool === 'signature') {
    for (let pass = 0; blob.size > targetKB * 1024 && pass < 14; pass += 1) {
      if (quality > .2) quality = Math.max(.2, quality - .1);
      else {
        const smaller = document.createElement('canvas');
        smaller.width = Math.max(1, Math.round(canvas.width * .82));
        smaller.height = Math.max(1, Math.round(canvas.height * .82));
        smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height);
        canvas = smaller;
      }
      blob = await canvasBlob(canvas, type, quality);
    }
  }
  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
  const base = item.file.name.replace(/\.[^/.]+$/, '') || 'image';
  return { blob, url: URL.createObjectURL(blob), name: `${base}-${tool}.${ext}` };
}

async function processFiles(drawer, tool) {
  if (busy || !selectedFiles.length) return;
  busy = true;
  const button = drawer.querySelector('[data-process]');
  const error = drawer.querySelector('[data-error]');
  button.disabled = true;
  button.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span>Processing…';
  drawer.querySelector('[data-download]').hidden = true;
  drawer.querySelector('[data-zip]').hidden = true;
  drawer.querySelector('[data-result-comparison]').hidden = true;
  error.hidden = true;
  processed.forEach((output) => output && URL.revokeObjectURL(output.url));
  processed = [];
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (tool === 'ocr') {
      drawer.querySelector('[data-ocr-text]').value = await extractText(selectedFiles[activeIndex].image);
      sessionProcessed += 1;
      updateSessionStats();
      return;
    }
    if (tool === 'palette') {
      await extractPalette(selectedFiles[activeIndex].image, drawer);
      sessionProcessed += 1;
      updateSessionStats();
      return;
    }
    if (tool === 'grid') {
      activeIndex = 0;
      processed = await splitImage(selectedFiles[0], drawer);
      sessionProcessed += processed.length;
      updateSessionStats();
      updatePreview(drawer);
      drawer.querySelector('[data-download]').hidden = true;
      drawer.querySelector('[data-download]').disabled = true;
      return;
    }
    for (let i = 0; i < selectedFiles.length; i += 1) {
      processed[i] = await renderImage(selectedFiles[i], drawer, tool);
    }
    sessionProcessed += processed.filter(Boolean).length;
    sessionSaved += processed.reduce((sum, output, index) => sum + (output ? Math.max(0, selectedFiles[index].file.size - output.blob.size) : 0), 0);
    updateSessionStats();
    updatePreview(drawer);
  } catch (problem) {
    error.textContent = problem.message || 'Could not process the selected image.';
    error.hidden = false;
  } finally {
    busy = false;
    button.innerHTML = `${toolNames[tool]} <span>→</span>`;
    button.disabled = false;
  }
}

function downloadActive() {
  const result = processed[activeIndex];
  if (!result) return;
  const link = document.createElement('a');
  link.href = result.url; link.download = result.name; link.click();
  showDownloadToast();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
async function makeZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0x0800); write32(lv, 14, checksum);
    write32(lv, 18, data.length); write32(lv, 22, data.length); write16(lv, 26, name.length); local.set(name, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    write32(cv, 0, 0x02014b50); write16(cv, 4, 20); write16(cv, 6, 20); write16(cv, 8, 0x0800);
    write32(cv, 16, checksum); write32(cv, 20, data.length); write32(cv, 24, data.length); write16(cv, 28, name.length);
    write32(cv, 42, offset); central.set(name, 46); centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054b50); write16(ev, 8, entries.length); write16(ev, 10, entries.length);
  write32(ev, 12, centralSize); write32(ev, 16, offset);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}
async function downloadZip() {
  const entries = processed.filter(Boolean);
  if (!entries.length) return;
  const url = URL.createObjectURL(await makeZip(entries));
  const link = document.createElement('a'); link.href = url; link.download = 'pixelkit-images.zip'; link.click();
  showDownloadToast();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('paste', (event) => {
  const drawer = document.querySelector('.tool-drawer.open');
  if (!drawer || !activeTool) return;
  const pasted = Array.from(event.clipboardData?.items || []).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
  if (!pasted.length) return;
  event.preventDefault();
  if (activeTool === 'pdf') addPdfImages(pasted, drawer);
  else addFiles(pasted, drawer);
});

function setupGuideAccordion() {
  const guideCards = Array.from(document.querySelectorAll('.guide-card'));
  guideCards.forEach((card, index) => {
    const top = card.querySelector('.guide-card-top');
    const icon = top.querySelector('.guide-icon');
    const title = top.querySelector('h3');
    const badges = top.querySelector('.guide-badges');
    const points = card.querySelector('ul');
    const toggle = document.createElement('button');
    const content = document.createElement('div');
    const contentInner = document.createElement('div');
    const chevron = document.createElement('span');

    toggle.type = 'button';
    toggle.className = 'guide-card-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', `guide-content-${index}`);
    toggle.append(icon, title);
    chevron.className = 'guide-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    toggle.append(chevron);

    content.className = 'guide-card-content';
    content.id = `guide-content-${index}`;
    content.setAttribute('aria-hidden', 'true');
    contentInner.className = 'guide-card-content-inner';
    contentInner.append(badges, points);
    content.append(contentInner);
    card.replaceChildren(toggle, content);

    toggle.addEventListener('click', () => {
      const shouldOpen = toggle.getAttribute('aria-expanded') !== 'true';
      guideCards.forEach((otherCard) => {
        const otherToggle = otherCard.querySelector('.guide-card-toggle');
        const otherContent = otherCard.querySelector('.guide-card-content');
        const isOpen = shouldOpen && otherCard === card;
        otherToggle.setAttribute('aria-expanded', String(isOpen));
        otherContent.setAttribute('aria-hidden', String(!isOpen));
        otherCard.classList.toggle('expanded', isOpen);
      });
    });
  });
}

setupGuideAccordion();

window.addEventListener('beforeunload', () => {
  selectedFiles.forEach((item) => URL.revokeObjectURL(item.url));
  processed.forEach((item) => item && URL.revokeObjectURL(item.url));
  pdfImages.forEach((item) => URL.revokeObjectURL(item.url));
  if (pdfOutputUrl) URL.revokeObjectURL(pdfOutputUrl);
});
