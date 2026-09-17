/*
 * Educational Atlas of 3D Bones — shared data access
 *
 * The list of bones and their files comes from data/manifest.json, which is
 * generated from the Hugging Face dataset by scripts/build_manifest.py.
 * Downloads are served by Hugging Face; the 3D viewers read the STL files
 * from the local Mesh/ folder next to index.html, which mirrors
 * visible_human_3d_models/CT/Mesh of the dataset.
 */

export const FORMATS = [
    { ext: "stl", label: "STL", folder: "Mesh" },
    { ext: "iges", label: "IGES", folder: "NURBS" },
    { ext: "step", label: "STEP", folder: "NURBS" },
];

let manifestPromise;

export function loadManifest() {
    manifestPromise ??= fetch("data/manifest.json").then((res) => {
        if (!res.ok) throw new Error(`Could not load the bone list (HTTP ${res.status}).`);
        return res.json();
    });
    return manifestPromise;
}

const path = (...segments) => segments.map(encodeURIComponent).join("/");

/** Hugging Face download link for one file of one bone. */
export function downloadUrl(manifest, subject, region, file, format) {
    const filePath = path(format.folder, subject, region, `${file}.${format.ext}`);
    return `https://huggingface.co/datasets/${manifest.repo}/resolve/main/${manifest.root}/${filePath}?download=true`;
}

/** Hugging Face page listing a folder of the dataset. */
export function folderUrl(manifest, ...segments) {
    return `https://huggingface.co/datasets/${manifest.repo}/tree/main/${manifest.root}/${path(...segments)}`;
}

/** Local STL used by the 3D viewers. */
export function viewerMeshUrl(subject, region, file) {
    return path("Mesh", subject, region, `${file}.stl`);
}

const SPECIAL_NAMES = {
    SKULL_CRANIAL_MAXILLA: "Cranium with maxilla",
    SKULL_MANDIBLE: "Mandible",
    HIP: "Hip bone",
};

/** "RIB_10_LEFT" -> "Rib 10 (left)", "PHALANGE_HAND_2_RIGHT" -> "Phalanges of finger 2 (right)". */
export function boneLabel(bone) {
    const m = bone.match(/^(.*?)(?:_(LEFT|RIGHT))?$/);
    let stem = m[1];
    const side = m[2] ? ` (${m[2].toLowerCase()})` : "";

    let name = SPECIAL_NAMES[stem];
    if (!name) {
        const phalanx = stem.match(/^PHALANGE_(HAND|FOOT)_(\d+)$/);
        if (phalanx) {
            name = `Phalanges of ${phalanx[1] === "HAND" ? "finger" : "toe"} ${phalanx[2]}`;
        } else {
            stem = stem.replace(/_/g, " ").toLowerCase();
            name = stem.charAt(0).toUpperCase() + stem.slice(1);
            name = name.replace(/\b([ctl])(\d+)$/, (_, level, n) => level.toUpperCase() + n);
        }
    }
    return name + side;
}

export function humanSize(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
