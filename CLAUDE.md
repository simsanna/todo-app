# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Todo App

## Stack
- Plain HTML, CSS, JavaScript (no framework)
- Data stored in `localStorage`
- No build step — open `index.html` directly in a browser

## Running the app
Open `index.html` in Chrome. No server needed.

## Conventions
- One file per concern: `index.html`, `style.css`, `app.js`
- Don't add any new pages — everything stays on one screen
- Write in short sentences. One idea each.
- If anything is unclear, ask me a question before making assumptions.
- Add a comment above each function explaining what it does
- Always confirm with me before adding a new feature or page that wasn't in the original request

## Do not
- Add external libraries or packages (including npm dependencies) without asking me first
- Use `eval()`
- Inline styles in HTML — all styles go in `style.css`

