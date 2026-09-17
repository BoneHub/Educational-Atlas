<div align="center">

<h2>
  ✨ <a href="https://bonehub.github.io/Educational-Atlas/">Access Atlas</a> ✨
</h2>

<p>👆 Click above to browse the Atlas 👆</p>


<img src="./webpage/resources/logo-with-text.png" width="30%" />

<br>
<br>

<a href="https://bonehub.github.io/Educational-Atlas/"><img alt="Educational-Atlas" src="https://img.shields.io/badge/Webpage-Live-green"></a>
</div>

# Educational Atlas

An anatomical atlas of 3D bones for educational purposes.

This repository hosts the website of the atlas. It covers the full skeletons of the
Visible Human Male and Female, segmented bone by bone from CT. Each bone is available as a
surface **mesh** (STL) and as a NURBS **CAD** model (IGES and STEP). The model files are
published in the Hugging Face dataset
[BoneHub/visible-human-3d-models](https://huggingface.co/datasets/BoneHub/visible-human-3d-models).


## Repository structure

```
webpage/               The website published to GitHub Pages
  index.html
  css/styles.css
  data/manifest.json   List of body parts, bones and files (generated, see below)
  js/atlas.js          Shared helpers: manifest, Hugging Face links, bone names
  js/app.js            Download tables (links point to Hugging Face)
  js/viewer.js         Three.js viewers, one per subject
  Mesh/                STL files for the viewers, laid out like CT/Mesh of the dataset:
                       Mesh/<01_Male|02_Female>/<body part>/<BONE>.stl
  resources/           Logos and icons
scripts/
  build_manifest.py    Regenerates webpage/data/manifest.json from a dataset clone
.github/workflows/     CI: deploys webpage/ to GitHub Pages
```

The site has no build step. When the dataset changes, regenerate the manifest from a
local clone of the Hugging Face repository and commit it:

```
python scripts/build_manifest.py path/to/visible-human-3d-models
```

Only files tracked by git in the clone are listed. The 3D viewers load the STL files in
`webpage/Mesh/`, using the file names in the manifest; bones whose file is missing are
skipped.

## Disclaimer

The bone models provided here are intended for educational purposes only.
They are not suitable for medical diagnosis or treatment planning. Users should exercise caution and
consult appropriate professionals when using these models in any context that may impact health or safety.
