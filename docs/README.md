# Magic Chess docs

Source for https://amalnathsathyan.github.io/magic-chess/, built with [Docusaurus](https://docusaurus.io/).

```bash
npm ci
npm start        # dev server with live reload
npm run build    # production build; fails on broken links
npm run serve    # preview the build
```

Pages live in `docs/`. The sidebar is generated from the folders: each folder's `_category_.json` sets its label and order, and each page's `sidebar_position` sets its place inside the folder. Mermaid diagrams are enabled in fenced `mermaid` blocks.

A push to `dev` that touches `docs/` deploys the site through `.github/workflows/deploy-docs.yml`.
