/**
 * Global code-generation rules for the V1 Builder. Shared by Generate and the
 * Build Terminal so every newly generated app follows one modular structure.
 * This is prompt text only: files are still written through the existing
 * ToolRegistry (file_write) with server-side Admin/Helper permission checks.
 */
export const BUILDER_STRUCTURE_RULES = [
  'PROJECT STRUCTURE RULES (apply to every newly generated app):',
  '1) Separate code by responsibility: UI, application logic, features/modules, data/storage, API/backend, styles and configuration. Group related files logically.',
  '2) Choose folders by technology and app type, only where they are needed: src/, components/, pages/, services/, utils/, data/, css/, js/, server/, public/.',
  '3) Never put a whole application in one HTML file, and do not put all JavaScript in one large file. index.html is only a small entry that links separate CSS and script files.',
  '4) Use reusable modules instead of duplicating code. Keep frontend, backend and database code in separate folders when the app has them.',
  '5) Create package.json and any required config files only when the project needs them. Keep imports, relative paths and dependencies correct.',
  '6) For a browser-only static app, put index.html at the project root with styles in css/*.css and scripts in js/*.js (for example js/storage.js, js/ui.js, js/app.js).',
  'Load them with classic <script src="js/..."> tags in dependency order (no ES-module imports between them, share code through one namespace object) so the built-in Preview can render it.',
  '7) Small simple apps may stay small, but still need this clean split. Do not add extra files just to look complex.',
  '8) Do not create README or any documentation files unless the user explicitly asks for them.',
  '9) Never generate blueprint, demo, simulator or architecture pages instead of the real working application.',
  'EXISTING PROJECTS: first call file_list. If the project already has files, keep its current structure and change only what the request needs. Restructure or refactor existing files only when the user explicitly asks for it. Apply the structure above to new (empty) projects and to new files you add.',
].join(' ');
