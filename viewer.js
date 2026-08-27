/*
 * Educational Atlas of 3D Bones — interactive 3D viewer
 *
 * Loads every mesh (STL) from the repository and renders them together in a
 * single Three.js scene. Everything runs client-side in the browser: the file
 * list comes from the GitHub API and the geometry is streamed straight from
 * raw.githubusercontent.com. No server or build step is involved.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const CONFIG = {
    owner: "BoneHub",
    repo: "Educational-Atlas",
    branch: "main",
    meshPath: "data/mesh",
};

// Distinct, high-contrast colours assigned to meshes in load order.
const PALETTE = [
    0xe6194b, 0x3cb44b, 0x4363d8, 0xf58231, 0x911eb4,
    0x46f0f0, 0xf032e6, 0xbcf60c, 0x008080, 0x9a6324,
    0xfabebe, 0x800000, 0xaaffc3, 0x808000, 0x000075,
];

const els = {
    canvas: document.getElementById("viewerCanvas"),
    status: document.getElementById("viewerStatus"),
    list: document.getElementById("viewerList"),
    reset: document.getElementById("viewerReset"),
    rotate: document.getElementById("viewerRotate"),
    wire: document.getElementById("viewerWire"),
};

if (els.canvas) {
    main();
}

/** Turn a file name into a human-readable bone label (mirrors app.js). */
function prettyName(fileName) {
    const stem = fileName.replace(/\.[^.]+$/, "");
    return (
        stem
            .split(/[_\-\s]+/)
            .filter((part) => part && !/^\d+$/.test(part))
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(" ")
            .trim() || stem
    );
}

let renderer;
let scene;
let camera;
let controls;
let group;
const entries = []; // { name, mesh, material, color }

function main() {
    try {
        initScene();
    } catch (err) {
        console.error(err);
        setStatus("WebGL is not available in this browser, so the 3D viewer cannot start.");
        return;
    }
    loadAll();
}

function setStatus(text) {
    if (!els.status) return;
    if (text) {
        els.status.textContent = text;
        els.status.style.display = "";
    } else {
        els.status.style.display = "none";
    }
}

function initScene() {
    const width = els.canvas.clientWidth || 800;
    const height = els.canvas.clientHeight || 520;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x1b2733, 1);
    els.canvas.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1_000_000);
    camera.position.set(300, 300, 300);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.2;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3542, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 1.2, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-1, -0.4, -1);
    scene.add(fill);

    group = new THREE.Group();
    scene.add(group);

    new ResizeObserver(onResize).observe(els.canvas);

    els.reset.addEventListener("click", fitView);
    els.wire.addEventListener("change", () => {
        for (const entry of entries) entry.material.wireframe = els.wire.checked;
    });

    renderer.setAnimationLoop(animate);
}

function onResize() {
    const width = els.canvas.clientWidth;
    const height = els.canvas.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    controls.autoRotate = els.rotate.checked;
    controls.update();
    renderer.render(scene, camera);
}

/** Frame the camera to the combined bounding box of all visible meshes. */
function fitView() {
    const box = new THREE.Box3();
    let hasVisible = false;
    for (const entry of entries) {
        if (entry.mesh.visible) {
            box.expandByObject(entry.mesh);
            hasVisible = true;
        }
    }
    if (!hasVisible) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fitDist = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));

    const direction = new THREE.Vector3(1, 0.7, 1).normalize();
    camera.position.copy(center).add(direction.multiplyScalar(fitDist * 1.7));
    camera.near = maxDim / 1000;
    camera.far = maxDim * 1000;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.maxDistance = maxDim * 20;
    controls.update();
}

async function fetchMeshFiles() {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.meshPath}?ref=${CONFIG.branch}`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 403) {
        throw new Error("GitHub API rate limit reached. Please try again in a little while.");
    }
    if (!res.ok) {
        throw new Error(`Could not load the mesh list (HTTP ${res.status}).`);
    }
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items
        .filter((it) => it.type === "file" && /\.stl$/i.test(it.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function loadMesh(loader, file, color) {
    return new Promise((resolve) => {
        loader.load(
            file.download_url,
            (geometry) => {
                geometry.computeVertexNormals();
                const material = new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.55,
                    metalness: 0.1,
                });
                const mesh = new THREE.Mesh(geometry, material);
                group.add(mesh);
                entries.push({
                    name: prettyName(file.name),
                    mesh,
                    material,
                    color,
                });
                resolve(true);
            },
            undefined,
            (err) => {
                console.error(`Failed to load ${file.name}`, err);
                resolve(false);
            }
        );
    });
}

async function loadAll() {
    let files;
    try {
        files = await fetchMeshFiles();
    } catch (err) {
        setStatus(err.message);
        els.list.innerHTML = '<li class="viewer-list-empty">Model list unavailable.</li>';
        return;
    }

    if (files.length === 0) {
        setStatus("No mesh models are available yet.");
        els.list.innerHTML = '<li class="viewer-list-empty">No meshes found.</li>';
        return;
    }

    const loader = new STLLoader();
    let done = 0;
    setStatus(`Loading 3D models… 0/${files.length}`);

    await Promise.all(
        files.map((file, i) =>
            loadMesh(loader, file, PALETTE[i % PALETTE.length]).then((ok) => {
                done += 1;
                setStatus(`Loading 3D models… ${done}/${files.length}`);
                if (ok) fitView();
            })
        )
    );

    entries.sort((a, b) => a.name.localeCompare(b.name));
    buildList();
    fitView();

    if (entries.length === 0) {
        setStatus("The mesh models could not be loaded.");
    } else {
        setStatus(null);
    }
}

function buildList() {
    els.list.innerHTML = "";
    for (const entry of entries) {
        const li = document.createElement("li");
        const label = document.createElement("label");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.addEventListener("change", () => {
            entry.mesh.visible = checkbox.checked;
            fitView();
        });

        const swatch = document.createElement("span");
        swatch.className = "viewer-swatch";
        swatch.style.backgroundColor = `#${entry.color.toString(16).padStart(6, "0")}`;

        const text = document.createElement("span");
        text.textContent = entry.name;

        label.append(checkbox, swatch, text);
        li.append(label);
        els.list.append(li);
    }
}
