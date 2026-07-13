# Above the Gray Fog — Tarot Club Resume

A single-page resume website themed after the Tarot Club gatherings in the
Sefirah Castle (*Lord of the Mysteries*). Members appear as fog-concealed
figures with crimson stars seated around the ancient long table; clicking a
star bursts it open into that chapter of the resume.

**Stack:** plain HTML / CSS / JS — no build step, no dependencies.

## The seats

| Honorific    | Section     |
| ------------ | ----------- |
| The Fool     | About Me    |
| The Magician | Projects    |
| Justice      | Internships |
| The Hermit   | Skills      |
| The Sun      | Education   |
| The Star     | Contact     |

## Editing your content

All content lives in [index.html](index.html). Search for the
`═══ EDIT: ... ═══` comment markers — each one marks a placeholder block:

- your name: in `<title>`, the `.masthead` `<h1>`, and the About chapter
- one `<article class="chapter">` per resume section
- projects are `.card` blocks; internships/education are `.entry` blocks;
  skills are `.skill-group` blocks; contact links are in `.contact-list`

Deep links work: `yoursite.com/#projects` opens The Magician's chapter directly
(`#about`, `#internships`, `#skills`, `#education`, `#contact`).

## Running locally

Any static server works:

```sh
npx http-server -p 4173 .
# or: python3 -m http.server 4173
```

## Deploying

It's a static site — GitHub Pages, Netlify, Vercel, or any web host. For
GitHub Pages: push, then Settings → Pages → deploy from branch.

## Accessibility & motion

- Every seat is a real `<button>`: keyboard focusable, `Esc` closes chapters,
  focus returns to the seat you came from.
- `prefers-reduced-motion` is respected — the fog freezes into a still veil
  and the burst becomes a simple fade.
