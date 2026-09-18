/*
 * Educational Atlas of 3D Bones — download tables
 *
 * One collapsible table per body part, one row per bone, with STL, IGES and
 * STEP download links for each subject. Everything is generated from
 * data/manifest.json (see js/atlas.js); nothing about the bones is hard-coded.
 */
import {
    FORMATS,
    boneLabel,
    downloadUrl,
    folderUrl,
    humanSize,
    loadManifest,
} from "./atlas.js";

const els = {
    regions: document.getElementById("regions"),
    count: document.getElementById("datasetCount"),
    search: document.getElementById("boneSearch"),
    expand: document.getElementById("expandAll"),
    collapse: document.getElementById("collapseAll"),
};

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Clicks on links carrying data-track are counted as GoatCounter events (see
 * the "Events" list on the GoatCounter dashboard). A delegated listener is used
 * because the tables are rendered after GoatCounter's script may have loaded.
 */
function trackClicks() {
    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[data-track]");
        if (!link || !window.goatcounter?.count) return;
        window.goatcounter.count({ path: link.dataset.track, title: link.title || link.textContent.trim(), event: true });
    });
}

function renderCell(manifest, subject, region, entry, format) {
    if (!entry || entry[format.ext] === undefined) {
        return '<td class="dl-cell"><span class="unavailable" title="Not available for this subject">&mdash;</span></td>';
    }
    const fileName = `${entry.file}.${format.ext}`;
    const size = humanSize(entry[format.ext]);
    const track = `download/${subject.id}/${region.id}/${fileName}`;
    return (
        `<td class="dl-cell"><a class="btn-link" href="${downloadUrl(manifest, subject.id, region.id, entry.file, format)}"` +
        ` data-track="${escapeHtml(track)}"` +
        ` download="${escapeHtml(fileName)}" title="${escapeHtml(`${subject.label}: ${fileName} (${size})`)}">` +
        `${format.label}<span class="btn-size">${size}</span></a></td>`
    );
}

function renderRegion(manifest, region) {
    const { subjects } = manifest;

    const subjectHeads = subjects
        .map((s) => `<th colspan="${FORMATS.length}" class="subject-head">${escapeHtml(s.label)}</th>`)
        .join("");
    const formatHeads = subjects
        .map(() => FORMATS.map((f) => `<th class="format-head">${f.label}</th>`).join(""))
        .join("");

    const rows = region.bones
        .map((bone) => {
            const label = boneLabel(bone.id);
            const cells = subjects
                .map((s) => FORMATS.map((f) => renderCell(manifest, s, region, bone.files[s.id], f)).join(""))
                .join("");
            return `<tr data-search="${escapeHtml(`${label} ${bone.id}`.toLowerCase())}"><td class="bone-name">${escapeHtml(label)}</td>${cells}</tr>`;
        })
        .join("");

    const browse = subjects
        .map((s) => `<a href="${folderUrl(manifest, "Mesh", s.id, region.id)}" data-track="${escapeHtml(`browse/${s.id}/${region.id}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`)
        .join(" · ");

    const details = document.createElement("details");
    details.className = "region";
    details.innerHTML = `
        <summary>
            <span class="region-title">${escapeHtml(region.label)}</span>
            <span class="region-count">${region.bones.length} bone${region.bones.length === 1 ? "" : "s"}</span>
        </summary>
        <div class="region-body">
            <p class="region-browse">Browse on Hugging Face: ${browse}</p>
            <div class="table-container">
                <table>
                    <thead>
                        <tr><th rowspan="2" class="bone-head">Bone</th>${subjectHeads}</tr>
                        <tr>${formatHeads}</tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    return details;
}

function render(manifest) {
    els.regions.replaceChildren(...manifest.regions.map((r) => renderRegion(manifest, r)));

    const counts = manifest.subjects.map((s) => {
        const n = manifest.regions.reduce(
            (acc, r) => acc + r.bones.filter((b) => b.files[s.id]).length,
            0
        );
        return `${n} ${s.label.toLowerCase()}`;
    });
    els.count.textContent =
        `${manifest.regions.length} body parts · bones: ${counts.join(", ")} · ` +
        `each as STL mesh and IGES/STEP CAD`;
}

function applySearch() {
    const query = els.search.value.trim().toLowerCase();
    for (const details of els.regions.querySelectorAll("details.region")) {
        let matches = 0;
        for (const row of details.querySelectorAll("tbody tr")) {
            const hit = !query || row.dataset.search.includes(query);
            row.hidden = !hit;
            if (hit) matches++;
        }
        details.hidden = matches === 0;
        if (query) details.open = matches > 0;
    }
}

function setAllOpen(open) {
    for (const details of els.regions.querySelectorAll("details.region:not([hidden])")) {
        details.open = open;
    }
}

async function init() {
    trackClicks();
    try {
        render(await loadManifest());
    } catch (err) {
        console.error(err);
        els.regions.innerHTML = `<div class="error-state">${escapeHtml(err.message || "Something went wrong while loading the atlas.")}</div>`;
        els.count.textContent = "Could not load the atlas";
        return;
    }
    els.search.addEventListener("input", applySearch);
    els.expand.addEventListener("click", () => setAllOpen(true));
    els.collapse.addEventListener("click", () => setAllOpen(false));
}

init();
