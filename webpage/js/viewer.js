/*
 * Educational Atlas of 3D Bones — interactive 3D viewers
 *
 * One viewer per subject (every element with a data-subject attribute). Each
 * viewer loads that subject's STL meshes from Mesh/<subject>/<body part>/ next
 * to index.html, as listed in data/manifest.json, and renders the whole
 * skeleton in a Three.js scene. A viewer only starts loading once it is
 * scrolled into view. Everything runs client-side; no build step is involved.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { boneLabel, loadManifest, viewerMeshUrl } from "./atlas.js";

// One colour per body part, in manifest order.
const PALETTE = [
    0xe8d8b0, 0xe6194b, 0x3cb44b, 0x4363d8, 0xf58231, 0x911eb4,
    0x46c8c8, 0xf032e6, 0xbcd60c, 0x008080, 0xc08040, 0xfabebe,
];

// Meshes downloaded in parallel per viewer.
const CONCURRENCY = 6;

// Emissive tint of the bone under the cursor, or under the pointer in the list.
const HIGHLIGHT = 0x664400;

// The meshes use patient coordinates: +Z superior, -Y anterior, +X left.
const UP = new THREE.Vector3(0, 0, 1);
// Direction from the skeleton towards the camera: in front, slightly to its left and above.
const FRONT_VIEW = new THREE.Vector3(0.35, -1, 0.15).normalize();

const hex = (color) => `#${color.toString(16).padStart(6, "0")}`;

/** Probe for a usable WebGL context. */
function hasWebGL() {
    try {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
}

class SubjectViewer {
    constructor(root, manifest, subject) {
        this.root = root;
        this.manifest = manifest;
        this.subject = subject;
        this.canvas = root.querySelector(".viewer-canvas");
        this.status = root.querySelector(".viewer-status");
        this.list = root.querySelector(".viewer-list");
        this.entries = []; // { region, bone, name, mesh, material }
        this.groups = new Map(); // region id -> { checkbox, entries }

        // Naming the bone under the cursor.
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.pointerOnCanvas = false;
        this.pickPending = false;
        this.highlighted = null;

        // Every bone of this subject, grouped by body part.
        this.regions = manifest.regions
            .map((region, i) => ({
                ...region,
                color: PALETTE[i % PALETTE.length],
                bones: region.bones.filter((b) => b.files[subject.id]?.stl !== undefined),
            }))
            .filter((region) => region.bones.length > 0);
    }

    setStatus(text) {
        this.status.textContent = text || "";
        this.status.hidden = !text;
    }

    start() {
        try {
            this.initScene();
        } catch (err) {
            console.error(err);
            this.setStatus(`The 3D viewer failed to start: ${err.message || err}.`);
            return;
        }
        this.buildList();
        this.loadAll();
    }

    initScene() {
        const width = this.canvas.clientWidth || 800;
        const height = this.canvas.clientHeight || 560;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x1b2733, 1);
        this.canvas.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 100_000);
        this.camera.up.copy(UP);
        this.camera.position.copy(FRONT_VIEW).multiplyScalar(3000);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.autoRotateSpeed = 1.5;
        this.controls.addEventListener("change", () => (this.pickPending = true));

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3542, 1.1));
        // Lights follow the camera so the side being looked at is always lit.
        const key = new THREE.DirectionalLight(0xffffff, 1.5);
        key.position.set(1, 1, 2);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5);
        fill.position.set(-1, -0.5, 1);
        this.camera.add(key, fill);
        this.scene.add(this.camera);

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            this.setStatus("The WebGL context was lost (often a GPU driver reset). Reload the page to retry.");
        });

        new ResizeObserver(() => this.onResize()).observe(this.canvas);

        this.initHover();

        const ui = (name) => this.root.querySelector(`[data-action="${name}"]`);
        this.rotate = ui("rotate");
        ui("reset").addEventListener("click", () => this.fitView());
        ui("show-all").addEventListener("click", () => this.setAllVisible(true));
        ui("hide-all").addEventListener("click", () => this.setAllVisible(false));
        ui("wireframe").addEventListener("change", (event) => {
            for (const entry of this.entries) entry.material.wireframe = event.target.checked;
        });

        this.renderer.setAnimationLoop(() => {
            this.controls.autoRotate = this.rotate.checked;
            this.controls.update();
            // A moving camera slides a different bone under a resting cursor.
            if (this.pickPending) {
                this.pickPending = false;
                this.pickBone();
            }
            this.renderer.render(this.scene, this.camera);
        });
    }

    /** Name the bone under the cursor in a label that follows it. */
    initHover() {
        this.tooltip = document.createElement("div");
        this.tooltip.className = "viewer-tooltip";
        this.tooltip.hidden = true;
        this.canvas.append(this.tooltip);

        const canvas = this.renderer.domElement;
        canvas.addEventListener("pointermove", (event) => {
            const rect = canvas.getBoundingClientRect();
            this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this.pointerOnCanvas = true;
            this.moveTooltip(event.clientX - rect.left, event.clientY - rect.top);
            this.pickBone();
        });
        canvas.addEventListener("pointerleave", () => {
            this.pointerOnCanvas = false;
            this.setHighlight(null);
        });
        // A touch ends without leaving the canvas.
        canvas.addEventListener("pointercancel", () => {
            this.pointerOnCanvas = false;
            this.setHighlight(null);
        });
    }

    moveTooltip(x, y) {
        // Flip the label to the other side of the cursor near the right edge,
        // where the canvas would otherwise clip it.
        const flip = x > this.canvas.clientWidth - 170;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
        this.tooltip.style.transform = flip
            ? "translate(calc(-100% - 14px), -50%)"
            : "translate(14px, -50%)";
    }

    pickBone() {
        if (!this.pointerOnCanvas || this.entries.length === 0) return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        // Raycaster does not skip hidden meshes, so ignore them here.
        const hit = this.raycaster
            .intersectObjects(this.group.children, false)
            .find((intersection) => intersection.object.visible);
        this.setHighlight(hit ? hit.object.userData.entry : null);
    }

    /** Highlight one bone and name it, or clear the highlight when null. */
    setHighlight(entry) {
        if (entry === this.highlighted) return;
        this.highlighted?.material.emissive.setHex(0x000000);
        this.highlighted = entry || null;

        if (entry) {
            entry.material.emissive.setHex(HIGHLIGHT);
            this.tooltip.textContent = entry.name;
        }
        this.tooltip.hidden = !entry;
        this.renderer.domElement.style.cursor = entry ? "pointer" : "";
    }

    onResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /** Frame the camera on all visible meshes, looking at the front. */
    fitView() {
        const box = new THREE.Box3();
        for (const entry of this.entries) {
            if (entry.mesh.visible) box.expandByObject(entry.mesh);
        }
        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const radius = size.length() / 2 || 1;
        const distance = radius / Math.sin((Math.PI * this.camera.fov) / 360);

        this.camera.position.copy(center).addScaledVector(FRONT_VIEW, distance);
        this.camera.near = distance / 100;
        this.camera.far = distance * 100;
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        this.controls.maxDistance = distance * 10;
        this.controls.update();
    }

    buildList() {
        this.list.replaceChildren();
        for (const region of this.regions) {
            const item = document.createElement("li");
            item.className = "viewer-group";

            const head = document.createElement("div");
            head.className = "viewer-group-head";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.disabled = true;
            checkbox.title = "Show or hide this body part";
            checkbox.addEventListener("change", () => {
                for (const entry of this.groups.get(region.id).entries) {
                    entry.setVisible(checkbox.checked);
                }
                this.syncGroup(region.id);
            });

            // The name toggles the bone list; the checkbox stays a separate control.
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "viewer-group-toggle";
            toggle.setAttribute("aria-expanded", "false");

            const swatch = document.createElement("span");
            swatch.className = "viewer-swatch";
            swatch.style.backgroundColor = hex(region.color);

            const title = document.createElement("span");
            title.className = "viewer-group-title";
            title.textContent = region.label;

            const count = document.createElement("span");
            count.className = "viewer-group-count";
            count.textContent = region.bones.length;

            toggle.append(swatch, title, count);
            head.append(checkbox, toggle);

            const bones = document.createElement("ul");
            bones.hidden = true;
            toggle.addEventListener("click", () => {
                bones.hidden = !bones.hidden;
                toggle.setAttribute("aria-expanded", String(!bones.hidden));
            });

            item.append(head, bones);
            this.list.append(item);

            this.groups.set(region.id, { checkbox, bones, entries: [] });
        }
    }

    addListItem(entry) {
        const group = this.groups.get(entry.region.id);
        const li = document.createElement("li");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.addEventListener("change", () => {
            entry.mesh.visible = checkbox.checked;
            this.syncGroup(entry.region.id);
        });
        const text = document.createElement("span");
        text.textContent = entry.name;
        label.append(checkbox, text);
        li.append(label);

        // Highlight the bone while hovering its name (without the tooltip, the
        // name is right there).
        li.addEventListener("mouseenter", () => entry.material.emissive.setHex(HIGHLIGHT));
        li.addEventListener("mouseleave", () => {
            if (entry !== this.highlighted) entry.material.emissive.setHex(0x000000);
        });

        entry.setVisible = (visible) => {
            checkbox.checked = visible;
            entry.mesh.visible = visible;
        };

        // Keep the manifest order within the group.
        group.entries.push(entry);
        group.entries.sort((a, b) => a.order - b.order);
        const index = group.entries.indexOf(entry);
        group.bones.insertBefore(li, group.bones.children[index] || null);
        group.checkbox.disabled = false;
        this.syncGroup(entry.region.id);
    }

    syncGroup(regionId) {
        const { checkbox, entries } = this.groups.get(regionId);
        const visible = entries.filter((e) => e.mesh.visible).length;
        checkbox.checked = visible > 0;
        checkbox.indeterminate = visible > 0 && visible < entries.length;
    }

    setAllVisible(visible) {
        for (const entry of this.entries) entry.setVisible(visible);
        for (const regionId of this.groups.keys()) this.syncGroup(regionId);
        if (visible) this.fitView();
    }

    loadMesh(loader, region, bone, order) {
        const file = bone.files[this.subject.id].file;
        return loader.loadAsync(viewerMeshUrl(this.subject.id, region.id, file)).then(
            (geometry) => {
                geometry.computeVertexNormals();
                const material = new THREE.MeshStandardMaterial({
                    color: region.color,
                    roughness: 0.6,
                    metalness: 0.05,
                });
                const mesh = new THREE.Mesh(geometry, material);
                this.group.add(mesh);
                const entry = { region, bone, order, name: boneLabel(bone.id), mesh, material };
                mesh.userData.entry = entry; // picked up when hovering the bone
                this.entries.push(entry);
                this.addListItem(entry);
                return true;
            },
            (err) => {
                console.warn(`${this.subject.label}: could not load ${file}.stl`, err);
                return false;
            }
        );
    }

    async loadAll() {
        const queue = this.regions.flatMap((region) => region.bones.map((bone) => ({ region, bone })));
        const total = queue.length;
        if (total === 0) {
            this.setStatus("No mesh models are listed for this subject.");
            return;
        }

        const loader = new STLLoader();
        let done = 0;
        let loaded = 0;
        let next = 0;
        this.setStatus(`Loading 3D models… 0/${total}`);

        const worker = async () => {
            while (next < queue.length) {
                const order = next++;
                const { region, bone } = queue[order];
                if (await this.loadMesh(loader, region, bone, order)) {
                    // Re-frame while the first meshes arrive, then leave the camera alone.
                    if (++loaded <= 5) this.fitView();
                }
                done++;
                this.setStatus(`Loading 3D models… ${done}/${total}`);
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        this.fitView();
        if (loaded === 0) {
            this.setStatus(`The mesh models are not available yet (expected in Mesh/${this.subject.id}/).`);
            for (const group of this.groups.values()) {
                group.bones.innerHTML = '<li class="viewer-list-empty">Not available.</li>';
            }
        } else if (loaded < total) {
            this.setStatus(null);
            console.warn(`${this.subject.label}: ${total - loaded} of ${total} meshes could not be loaded.`);
        } else {
            this.setStatus(null);
        }
    }
}

async function main() {
    const roots = [...document.querySelectorAll(".viewer-card[data-subject]")];
    if (roots.length === 0) return;

    const setAll = (text) => roots.forEach((r) => (r.querySelector(".viewer-status").textContent = text));

    if (!hasWebGL()) {
        setAll(
            "WebGL is disabled or unavailable in this browser, so the 3D viewer cannot start. " +
            "Enable hardware acceleration / WebGL in your browser settings, update your graphics driver, " +
            "or try a different browser."
        );
        return;
    }

    let manifest;
    try {
        manifest = await loadManifest();
    } catch (err) {
        setAll(err.message);
        return;
    }

    for (const root of roots) {
        const subject = manifest.subjects.find((s) => s.id === root.dataset.subject);
        if (!subject) {
            root.querySelector(".viewer-status").textContent = `Unknown subject "${root.dataset.subject}".`;
            continue;
        }
        root.querySelector(".viewer-meta").textContent =
            `· ${subject.age} years · ${Math.round(subject.height * 100)} cm · ${subject.weight} kg`;
        const viewer = new SubjectViewer(root, manifest, subject);
        // Start loading only when the viewer comes near the screen.
        const observer = new IntersectionObserver(
            (records) => {
                if (records.some((r) => r.isIntersecting)) {
                    observer.disconnect();
                    viewer.start();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(root);
    }
}

main();
