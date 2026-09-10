/*
 * Educational Atlas of 3D Bones
 *
 * The list of bones, their names, and the available file formats are read at
 * runtime from the GitHub repository. Nothing about the bones is hard-coded
 * here: add, remove, or rename files in the repository and this page follows.
 *
 * Only the repository coordinates and the folders that hold each model type
 * are configured below.
 */
const CONFIG = {
    owner: "BoneHub",
    repo: "Educational-Atlas",
    branch: "main",
    // One entry per table column (besides the "Bone" column).
    sources: [
        { key: "mesh", label: "Mesh", path: "data/mesh" },
        { key: "cad", label: "CAD", path: "data/cad" },
    ],
};

const els = {
    body: document.getElementById("tableBody"),
    count: document.getElementById("datasetCount"),
};

els.body.addEventListener("click", handleDownloadClick);

/** Turn a file name into a human-readable bone label. */
function prettyName(fileName) {
    const stem = fileName.replace(/\.[^.]+$/, "");
    return stem
        .split(/[_\-\s]+/)
        .filter((part) => part && !/^\d+$/.test(part)) // drop numeric id segments
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ")
        .trim() || stem;
}

/** Key used to match the same bone across different model folders. */
function boneKey(fileName) {
    return fileName.replace(/\.[^.]+$/, "").toLowerCase();
}

function fileExtension(fileName) {
    const m = fileName.match(/\.([^.]+)$/);
    return m ? m[1].toUpperCase() : "FILE";
}

function humanSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

async function fetchFolder(path) {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 404) return []; // folder not present yet
    if (res.status === 403) {
        throw new Error("GitHub API rate limit reached. Please try again in a little while.");
    }
    if (!res.ok) {
        throw new Error(`Could not load "${path}" (HTTP ${res.status}).`);
    }
    const items = await res.json();
    return Array.isArray(items) ? items.filter((it) => it.type === "file") : [];
}

function buildRows(folders) {
    // folders: { mesh: [items], cad: [items], ... }
    const bones = new Map();

    for (const source of CONFIG.sources) {
        for (const item of folders[source.key] || []) {
            const key = boneKey(item.name);
            if (!bones.has(key)) {
                bones.set(key, { name: prettyName(item.name), files: {} });
            }
            bones.get(key).files[source.key] = item;
        }
    }

    return [...bones.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderCell(item) {
    if (!item || !item.download_url) {
        return '<span class="unavailable">&mdash;</span>';
    }
    const ext = fileExtension(item.name);
    const size = humanSize(item.size);
    const title = size ? `${item.name} (${size})` : item.name;
    // A plain link to raw.githubusercontent.com opens text-based formats (e.g.
    // IGES) inline in the browser instead of downloading. We keep the href for
    // right-click / middle-click, but the click handler fetches the file and
    // saves it as a real download.
    const safeName = item.name.replace(/"/g, "&quot;");
    return (
        `<a class="btn-link" href="${item.download_url}" download="${safeName}"` +
        ` data-download-url="${item.download_url}" data-download-name="${safeName}"` +
        ` title="${title}">Download ${ext}</a>`
    );
}

async function handleDownloadClick(event) {
    const link = event.target.closest("a[data-download-url]");
    if (!link) return;

    // Let modified clicks (new tab, etc.) behave normally.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    if (link.dataset.busy) return;

    const url = link.dataset.downloadUrl;
    const fileName = link.dataset.downloadName || "model";
    const original = link.textContent;
    link.dataset.busy = "1";
    link.classList.add("is-busy");
    link.textContent = "Downloading…";

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (err) {
        console.error("Download failed", err);
        // Fall back to opening the raw file directly.
        window.open(url, "_blank", "noopener");
    } finally {
        delete link.dataset.busy;
        link.classList.remove("is-busy");
        link.textContent = original;
    }
}

function render(rows) {
    if (rows.length === 0) {
        els.body.innerHTML =
            '<tr><td colspan="3" class="empty-state">No bones are available yet.</td></tr>';
        els.count.textContent = "0 bones";
        return;
    }

    els.body.innerHTML = rows
        .map((row) => {
            const cells = CONFIG.sources
                .map((s) => `<td>${renderCell(row.files[s.key])}</td>`)
                .join("");
            return `<tr><td class="bone-name">${row.name}</td>${cells}</tr>`;
        })
        .join("");

    const fileCount = rows.reduce(
        (acc, r) => acc + Object.keys(r.files).length,
        0
    );
    els.count.textContent = `${rows.length} bone${rows.length === 1 ? "" : "s"} · ${fileCount} downloadable file${fileCount === 1 ? "" : "s"}`;
}

function showError(message) {
    els.body.innerHTML = `<tr><td colspan="3"><div class="error-state">${message}</div></td></tr>`;
    els.count.textContent = "Could not load the atlas";
}

async function init() {
    try {
        const results = await Promise.all(
            CONFIG.sources.map((s) => fetchFolder(s.path))
        );
        const folders = {};
        CONFIG.sources.forEach((s, i) => {
            folders[s.key] = results[i];
        });
        render(buildRows(folders));
    } catch (err) {
        console.error(err);
        showError(err.message || "Something went wrong while loading the atlas.");
    }
}

init();
