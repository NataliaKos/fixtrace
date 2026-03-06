# Demo Assets

Place sample files here for testing and demo recording:

- `sample-ui-screenshot.png` — A screenshot of a UI with deliberate issues (low contrast, missing ARIA, poor layout)
- `sample-lighthouse-report.json` — A Lighthouse JSON export with a low performance score
- `sample-devtools-trace.json` — A Chrome DevTools performance trace

## Getting a Lighthouse JSON

1. Open Chrome DevTools → Lighthouse tab
2. Run audit on any page
3. Click the export button (⬇) → "Save as JSON"
4. Drop the file into this folder

## Getting a DevTools trace

1. Open Chrome DevTools → Performance tab
2. Click Record, interact with the page, stop
3. Click the save icon → saves as `.json`
