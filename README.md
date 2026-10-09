# Portfolio: neural network theme

A single-page portfolio laid out as a network. The sidebar nav is a layer of neurons, and
a signal runs down it to the section you're reading. The hero shows a small feed-forward
net that loops a forward pass ending in a softmax. Each section is labelled as a layer
(Dense, Attention, Residual, Embedding, Softmax), and a field of drifting nodes sits behind
the page and links up to your cursor.

No build step and no dependencies: one HTML file, one stylesheet, two scripts.

```
index.html      all content, marked with EDIT comments
css/style.css   tokens at the top (colours, fonts, widths)
js/neural.js    the background field + hero network canvases
js/main.js      scroll reveal, nav scroll spy, count-up, copy email
```

## Filling in the placeholders

Everything is in `index.html`. Search for `EDIT`.

- **Name / title.** Change `<title>`, `.brand__name`, `.brand__role`, the hero `h1` and the footer.
- **Hero stats.** For numbers, `data-count` sets the count-up target. Keep the text inside
  the tag the same, so the number still shows without JS.
- **Network output labels.** The `data-outputs` attribute on `.hero__net` (three comma-separated words).
- **Resume.** Put `resume.pdf` next to `index.html`.
- **Experience.** One `<li class="job">` per role, newest first.
- **Projects.** `.feature` is the flagship. The loss-curve figure is decorative, so delete
  it if you want. `.cards` holds the smaller projects; an even count fills the grid best.
- **Awards.** One `<li>` per row: name, what you won, year.
- **Tech stack.** Each tile's icon is a [Simple Icons](https://simpleicons.org) slug in the
  `--icon` URL. Swap the slug and the label.
- **Contact.** The email appears twice: in the `mailto:` link and in `data-copy` on the copy button.

## Colours

Edit the tokens at the top of `css/style.css`. `--signal-rgb` is the activation colour
(links, lit neurons, pulses) and `--amber-rgb` is used for labels. If you change these,
also update `SIGNAL` and `AMBER` at the top of `js/neural.js` so the canvases match.

## Running it

```sh
python3 -m http.server 4177    # then open http://localhost:4177
```

You can deploy it to any static host, such as GitHub Pages, Netlify or Vercel.

## Behaviour

- **Under 960px** the sidebar becomes a sticky top bar with a scrolling row of nodes.
- With **`prefers-reduced-motion`** the canvases draw a single still frame and the reveals/transitions are off.
- **Without JS** all content renders normally; only the canvases are missing.
- The hero network pauses while it's off screen.
