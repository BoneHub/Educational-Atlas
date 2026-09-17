"""Build webpage/data/manifest.json from the Hugging Face dataset.

GitHub Pages cannot list folders, so the webpage reads the list of bones and
their files from this manifest. The dataset itself is the source: the script
reads its file tree over the Hugging Face API, so no local clone is needed.
Re-run it whenever the dataset changes, and commit the result:

    python scripts/build_manifest.py

Only what is actually published on Hugging Face is listed.
"""

import argparse
import json
import re
import urllib.request
from pathlib import Path

API = "https://huggingface.co/api/datasets"
RESOLVE = "https://huggingface.co/datasets"

HF_REPO = "BoneHub/visible-human-3d-models"
DATA_ROOT = "visible_human_3d_models/CT"
OUTPUT = Path(__file__).resolve().parent.parent / "webpage" / "data" / "manifest.json"

SUBJECTS = {
    "01_Male": "Male",
    "02_Female": "Female",
}

# Body parts in head-to-toe order, with the labels shown on the page.
REGIONS = {
    "SKULL": "Skull",
    "SPINAL_COLUMN": "Spinal column",
    "THORAX": "Thorax",
    "UPPER_EXTREMITY_LEFT": "Upper extremity (left)",
    "UPPER_EXTREMITY_RIGHT": "Upper extremity (right)",
    "HAND_LEFT": "Hand (left)",
    "HAND_RIGHT": "Hand (right)",
    "LOWER_EXTREMITY_LEFT": "Lower extremity (left)",
    "LOWER_EXTREMITY_RIGHT": "Lower extremity (right)",
    "FOOT_LEFT": "Foot (left)",
    "FOOT_RIGHT": "Foot (right)",
}

# File formats per dataset folder.
FORMATS = {
    "stl": "Mesh",
    "iges": "NURBS",
    "step": "NURBS",
}

SPINE_ORDER = {"C": 0, "T": 1, "L": 2, "S": 3}


def bone_sort_key(bone):
    """Natural sort (RIB_2 before RIB_10), with vertebrae in C-T-L order."""
    m = re.fullmatch(r"VERTEBRA_([CTL])(\d+)", bone)
    if m:
        return (0, SPINE_ORDER[m.group(1)], int(m.group(2)))
    if bone == "SACRUM":
        return (1,)
    parts = re.split(r"(\d+)", bone)
    return (2, [int(p) if p.isdigit() else p for p in parts])


def canonical_bone(region, stem):
    """Bone name matching the side of its folder.

    Some files carry the wrong side suffix (e.g. FEMUR_RIGHT.stl inside
    LOWER_EXTREMITY_LEFT). The page lists them under the folder's side, while
    the download link keeps the real file name.
    """
    for side, other in (("_LEFT", "_RIGHT"), ("_RIGHT", "_LEFT")):
        if region.endswith(side) and stem.endswith(other):
            return stem[: -len(other)] + side
    return stem


def get(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(), response.headers


def fetch_tree(repo, revision, folder):
    """Every file under a folder of the dataset, following the API's paging."""
    url = f"{API}/{repo}/tree/{revision}/{folder}?recursive=true"
    files = []
    while url:
        body, headers = get(url)
        files += [item for item in json.loads(body) if item["type"] == "file"]
        # The API caps a page at 1000 entries and links the next one.
        link = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link", ""))
        url = link.group(1) if link else None
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=HF_REPO, help="Hugging Face dataset (default: %(default)s)")
    parser.add_argument("--revision", default="main", help="branch, tag or commit (default: %(default)s)")
    args = parser.parse_args()

    # Pin the manifest to the commit the listing came from.
    info = json.loads(get(f"{API}/{args.repo}/revision/{args.revision}")[0])
    revision = info["sha"]

    # bones[region][bone][subject] = {"file": stem, ext: size in bytes, ...}
    bones = {region: {} for region in REGIONS}
    pattern = re.compile(
        rf"{re.escape(DATA_ROOT)}/(Mesh|NURBS)/([^/]+)/([^/]+)/([^/]+)\.(stl|iges|step)"
    )
    for item in fetch_tree(args.repo, revision, DATA_ROOT):
        m = pattern.fullmatch(item["path"])
        if not m:
            continue
        folder, subject, region, stem, ext = m.groups()
        if subject not in SUBJECTS or region not in REGIONS or FORMATS[ext] != folder:
            continue
        bone = canonical_bone(region, stem)
        if bone != stem:
            print(f"warning: {item['path']} is named {stem} but lies in {region}; listed as {bone}")
        entry = bones[region].setdefault(bone, {}).setdefault(subject, {"file": stem})
        entry[ext] = item["size"]

    metadata = json.loads(
        get(f"{RESOLVE}/{args.repo}/resolve/{revision}/{DATA_ROOT}/metadata.json")[0]
    )

    manifest = {
        "repo": args.repo,
        "revision": revision,
        "root": DATA_ROOT,
        "subjects": [
            {"id": sid, "label": label, **metadata.get(sid, {})}
            for sid, label in SUBJECTS.items()
        ],
        "regions": [
            {
                "id": region,
                "label": label,
                "bones": [
                    {"id": bone, "files": bones[region][bone]}
                    for bone in sorted(bones[region], key=bone_sort_key)
                ],
            }
            for region, label in REGIONS.items()
            if bones[region]
        ],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(manifest, indent=4) + "\n")

    counts = {
        sid: sum(sid in b["files"] for r in manifest["regions"] for b in r["bones"])
        for sid in SUBJECTS
    }
    print(f"Wrote {OUTPUT} ({', '.join(f'{k}: {v} bones' for k, v in counts.items())})")


if __name__ == "__main__":
    main()
