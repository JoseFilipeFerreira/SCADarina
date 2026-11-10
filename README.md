# ![SCADarina](img/logo/png/scadarina_64.png) SCADarina

A self-hosted Docker container for your personal OpenSCAD generator and model viewer.

---

<img src="img/screenshots/scadarina_01.png"
style="max-width: 70%;" />
<img src="img/screenshots/scadarina_02.png"
style="max-width: 70%;" />

_you can find more screenshots under `[/img/screenshots](img/screenshots/)`_

---

`SCADarina` is your own self-hosted remote OpenSCAD environment.

- Support for `.stl`, `.obj` and `.3mf` files
- A viewport with different shading options, grid layouts, a switch between orthogonal and perspective views, and a basic viewcube
- Measuring function with vertex snapping and delta readings
- Support for all OpenSCAD libraries and dependencies (e.g. [BOSL2](https://github.com/BelfrySCAD/BOSL2/))

`SCADarina` is **not** WASM. Under the hood, it uses a real `OpenSCAD` backend that runs entirely on the server. This means full support for external libraries, with no bottlenecks from your browser (even on mobile).

`.scad` files are sent to a `Python Flask` backend, where `OpenSCAD` renders them into a mesh. The resulting model is then displayed in the `Three.js` viewport in your browser.

---

## Run with Docker Compose

```yaml
services:
  scadarina:
    image: josefilipeferreira/scadarina:latest
    container_name: SCADarina
    restart: unless-stopped
    ports:
      - "5343:5000"
    volumes:
      - ./models:/app/models
      - ./libraries:/root/.local/share/OpenSCAD/libraries
```

```bash
docker compose up -d
```

Access the WebUI at `http://<your-ip>:5343`.

---

## Disclaimer

This project started as a fork of an amazing vibe-coded project by [CameraRick](https://github.com/CameraRick/SCADarina).

This project relies, and continues to rely, on mix of vibe coding and Old-school programming.

It's not an ideal solution, but it solves an issue for me. Maybe it will solve one for you.


---

## Third-Party Licenses & Credits

This project relies on the following projects:

- [**OpenSCAD**](https://openscad.org/)
  - License: [GPLv2](https://github.com/openscad/openscad/blob/master/COPYING)
  - Used in the backend container for model compilation and rendering
- [**Three.js**](https://github.com/mrdoob/three.js)
  - License: [MIT License](https://github.com/mrdoob/three.js/blob/master/LICENSE)
  - Copyright © 2010-2024 Three.js Authors
- [**fflate**](https://github.com/101arrowz/fflate)
  - License: [MIT License](https://github.com/101arrowz/fflate/blob/master/LICENSE)
  - Copyright © 2020-2023 Arjun Barrett
- [**Lucide Icons**](https://lucide.dev/)
  - License: [ISC / MIT License](https://lucide.dev/license)
  - Copyright © 2026 Lucide Icons and Contributors, 2013-present Cole Bemis
