# Portfolio: a page that trains itself

The name at the top isn't text. When the page loads, a small neural network starts from
random weights and learns to draw the name **in the visitor's browser**. It goes from
static, to blurry blobs, to sharp letters in about 15 seconds.

- **Fig. 1, the name field.** An MLP maps `(x, y) → 64 Fourier features → 48 → 48 → 1`
  (5,521 parameters). It's trained with Adam on a rasterised copy of the `<h1>`, inside a
  Web Worker, and its predictions are drawn as a dot matrix. Hover (or drag on touch) to
  probe any pixel. **↻ Retrain** starts again from new random weights.
- **Fig. 1b, the probe.** A live forward pass for the probed pixel through the real
  weights: Fourier features, both hidden layers and the sigmoid. It shows the 8 neurons per
  layer that matter most to the output.
- **Sidebar telemetry.** Step, loss and a log-scale loss curve for that same run.
- **Experience** is read as an RNN unrolled through time (h₁ … h₄).
- **Projects** each carry a 24-d feature-hashed embedding of their name and tags.
  Projects that share tools share bright cells.
- **Awards** is a paper-style results table.
- **Tech stack (Fig. 2)** is a 2-D embedding map. Points start collapsed and settle into
  place. Hover or tap one to see its nearest neighbours.

Headings and large text are set in **VT323**, a CRT-terminal font with a phosphor glow.
Each one types itself out the first time it scrolls into view. A block cursor leads, and
the last few characters flicker through random glyphs before they settle. Lines in view
type one after another, like a terminal. Any line you scroll past before its turn is filled
in instantly. The name in Fig. 1 stays in Instrument Serif, because that's what the
network learns.

No build step and no dependencies.

```
index.html         all content
css/style.css      tokens at the top (colours, fonts, widths)
js/namefield.js    Fig. 1 + 1b: the worker, trainer, dot matrix, probe, telemetry
js/embedding.js    Fig. 2 map + project embedding barcodes
js/backdrop.js     the drifting node field behind the page
js/typewriter.js   terminal typing for headings and large text
js/main.js         scroll reveal, nav scroll spy, count-up, copy email
```

## Editing content

Everything is in `index.html`.

- **Your name.** Change the `<h1>`: that text *is* the training data, and the network
  learns whatever you put there. Names longer than about 15 characters wrap onto two lines.
  Also update `<title>`, `.brand__name` and the footer.
- **Hero stats.** For numbers, `data-count` sets the count-up target.
- **Resume.** Put `resume.pdf` next to `index.html`.
- **Experience.** One `<li class="job">` per role, newest first. Number the `h<sub>`
  labels down to 1.
- **Projects.** `.feature` is the flagship. The loss-curve figure is decorative, so delete
  it if you want. Barcodes are generated from each card's title and tags automatically.
- **Awards.** One `<tr>` per result. Wrap your favourite in `<strong>`.
- **Tech stack.** Each `<li>` has `data-x` (0–100), `data-y` (0–60) and `data-c` (its
  cluster). Cluster names are in `data-clusters` on `.embed__map`. Icons are
  [Simple Icons](https://simpleicons.org) slugs in the `--icon` URL.
- **Contact.** The email appears twice: in the `mailto:` link and in `data-copy`.
- **Typing.** Add `data-type="40"` to any element to make it type itself out. The number is
  the average ms per character. Add `data-type-delay="300"` to pause before it starts.
  Remove the attribute and the text just appears.

## Tuning the network

`CFG` at the top of `js/namefield.js`:

| key     | default | what it does                                                     |
| ------- | ------- | ---------------------------------------------------------------- |
| `M`     | 32      | Fourier frequencies (features = 2 × M)                           |
| `H`     | 48      | width of both hidden layers                                      |
| `SIGMA` | 6       | frequency scale: higher gives sharper edges and more speckle     |
| `LR`    | 4e-3    | Adam learning rate                                               |
| `MAX`   | 2000    | steps before it stops and reports "converged"                    |

The pacing curve (`12s + 9s²` steps after `s` seconds) is in the worker's `tick()`.

## Running it

```sh
python3 -m http.server 4177    # then open http://localhost:4177
```

You can deploy it to any static host, such as GitHub Pages, Netlify or Vercel.

## Behaviour

- Training **pauses in background tabs**, so the name emerges when someone is looking.
- **Under 960px** the sidebar becomes a sticky top bar. Below about 760px wide, the stack map becomes chips grouped by cluster.
- With **`prefers-reduced-motion`** the network trains without the animation and the
  finished result appears once. Text appears without typing, and the reveals and
  transitions are off too.
- **Without JS** (or without Web Workers) the `<h1>` shows as normal text and the stack is
  a plain list.
