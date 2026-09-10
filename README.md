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

This repository hosts publicly available 3D bone models &mdash; each provided both
as a surface **mesh** and as a **CAD** model &mdash; for use in anatomy teaching,
visualization, 3D printing, and student projects.


## Repository structure

```
data/                  Bone models (the source of truth for the atlas)
  mesh/                Surface meshes (.stl)
  cad/                 CAD models (.iges)
webpage/               The website published to GitHub Pages
  index.html
  css/styles.css
  js/app.js            Builds the download table from the GitHub API
  js/viewer.js         Three.js viewer for the meshes
  resources/           Logos and icons
.github/workflows/     CI: deploys webpage/ to GitHub Pages
```

The site has no build step. It reads the contents of `data/` through the GitHub
API at runtime, so adding or renaming a model file is enough for it to show up
online &mdash; no page edits required.

## Disclaimer

The bone models provided here are intended for educational purposes only.
They are not suitable for medical diagnosis or treatment planning. Users should exercise caution and
consult appropriate professionals when using these models in any context that may impact health or safety.
